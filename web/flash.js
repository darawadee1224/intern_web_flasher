import * as esptool from "https://unpkg.com/esptool-js/lib/index.js";

let chip;
let port;

const logEl = document.getElementById("log");
const progressBar = document.getElementById("progressBar");
const progressPercent = document.getElementById("progressPercent");
const progressStatus = document.getElementById("progressStatus");

// ฟังก์ชัน Log ข้อความออกหน้าคอนโซล
const log = (msg) => {
  logEl.value += msg + "\n";
  logEl.scrollTop = logEl.scrollHeight;
};

// ฟังก์ชันเชื่อมต่อ ESP32 ผ่าน Web Serial API
async function connectESP() {
  try {
    if (port && port.readable) {
      log("🔄 ปิดพอร์ต Serial เดิม...");
      await port.close();
      log("✅ พอร์ตปิดแล้ว");
    }

    port = await navigator.serial.requestPort();

    const baudRate = parseInt(document.getElementById("baudRate").value);
    await port.open({ baudRate });

    const transport = new esptool.Transport(port, log);
    chip = new esptool.ESPLoader(transport, false);

    await chip.initialize();
    log("✅ เชื่อมต่อสำเร็จ!");

    await readChipInfo();
  } catch (e) {
    if (e.name === "NotFoundError") {
      log("❗ ยังไม่ได้เลือกพอร์ต Serial กรุณาเลือกอุปกรณ์");
    } else if (e.name === "InvalidStateError") {
      log("❗ พอร์ต Serial ยังเปิดอยู่ กรุณาปิดก่อนเชื่อมต่อใหม่");
    } else {
      log(`❌ เกิดข้อผิดพลาด: ${e.message || e}`);
    }
  }
}

// ฟังก์ชันอ่านข้อมูล Chip ล่าสุดมาแสดงผล
async function readChipInfo() {
  if (!chip) {
    log("❗ ไม่พบอุปกรณ์ที่เชื่อมต่อ");
    return;
  }

  try {
    const chipName = await chip.getChipName();
    const flashSize = await chip.getFlashSize();

    log("=== ข้อมูล Chip ล่าสุด ===");
    log(`Name        : ${chipName || "Unknown"}`);
    log(`Flash Size  : ${flashSize || "Unknown"} bytes`);

    if (typeof chip.readMac === "function") {
      const mac = await chip.readMac();
      const macStr = Array.from(mac)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(":");
      log(`MAC Address : ${macStr}`);
    }

    log("=========================");
    progressStatus.innerText = `Connected to ${chipName || "ESP32 Device"}`;
    progressStatus.style.color = "#3b82f6";
  } catch (err) {
    log(`❌ อ่านข้อมูล Chip ล้มเหลว: ${err}`);
  }
}

// ฟังก์ชันหลักในการแฟลชไฟล์ .bin พร้อมคำนวณ Progress แบบเรียลไทม์
async function flashESP() {
  if (!chip) {
    log("❗ กรุณาเชื่อมต่อก่อนแฟลช");
    return;
  }

  const files = [
    {
      input: document.getElementById("bootloader"),
      addr: document.getElementById("bootloaderAddr").value.trim(),
      name: "bootloader.bin"
    },
    {
      input: document.getElementById("partitions"),
      addr: document.getElementById("partitionsAddr").value.trim(),
      name: "partitions.bin"
    },
    {
      input: document.getElementById("firmware"),
      addr: document.getElementById("firmwareAddr").value.trim(),
      name: "firmware.bin"
    },
  ];

  const validFiles = [];

  for (const file of files) {
    if (file.input.files.length && file.addr.startsWith("0x")) {
      const addrInt = parseInt(file.addr, 16);
      if (isNaN(addrInt)) {
        log(`❌ Address ไม่ถูกต้อง: ${file.addr}`);
        continue;
      }
      const binData = await file.input.files[0].arrayBuffer();
      validFiles.push({
        addr: addrInt,
        data: new Uint8Array(binData),
        name: file.name
      });
    }
  }

  if (!validFiles.length) {
    log("❗ ไม่มีไฟล์ที่ถูกต้องสำหรับแฟลช");
    progressStatus.innerText = "❗ ไม่มีไฟล์ที่ถูกต้องสำหรับแฟลช";
    progressStatus.style.color = "#ef4444";
    return;
  }

  try {
    log("⚠️ ลบข้อมูล Flash...");
    progressStatus.innerText = "🧹 กำลังลบข้อมูล Flash (Erase Flash)...";
    progressStatus.style.color = "#eab308";
    await chip.eraseFlash();

    // เริ่มต้นสถานะ Progress Bar
    progressBar.value = 0;
    progressPercent.innerText = "0%";

    for (let i = 0; i < validFiles.length; i++) {
      const currentFile = validFiles[i];
      log(`⚡ กำลังแฟลชที่ 0x${currentFile.addr.toString(16)} (${currentFile.data.length} bytes)...`);
      
      // เรียกใช้ callback ของ esptool-js เพื่อจับจำนวน bytes ที่เขียนจริงในแต่ละไฟล์
      await chip.flashData(currentFile.data, currentFile.addr, (bytesWritten, totalBytes) => {
        // คำนวณความคืบหน้าของไฟล์ปัจจุบัน
        const fileProgress = bytesWritten / totalBytes;
        
        // คำนวณสัดส่วนเฉลี่ยรวมทุกไฟล์ที่ประมวลผลอยู่
        const totalProgress = ((i + fileProgress) / validFiles.length) * 100;
        
        // อัปเดตขึ้นสู่หน้าจอ UI 
        progressBar.value = totalProgress;
        progressPercent.innerText = `${Math.round(totalProgress)}%`;
        progressStatus.innerText = `💾 กำลังเขียน (${i + 1}/${validFiles.length}): ${currentFile.name} [${Math.round(fileProgress * 100)}%]`;
        progressStatus.style.color = "#0ea5e9";
      });
    }

    await chip.hardReset();
    await new Promise((res) => setTimeout(res, 500));
    
    // สำเร็จเสร็จสิ้น
    log("✅ แฟลช Firmware เสร็จสมบูรณ์!");
    progressBar.value = 100;
    progressPercent.innerText = "100%";
    progressStatus.innerText = "✨ แฟลชเฟิร์มแวร์ลงบอร์ด ESP32 สำเร็จเรียบร้อย!";
    progressStatus.style.color = "#10b981";
  } catch (err) {
    log(`❌ แฟลชล้มเหลว: ${err}`);
    progressBar.value = 0;
    progressPercent.innerText = "0%";
    progressStatus.innerText = `❌ แฟลชล้มเหลว: ${err}`;
    progressStatus.style.color = "#ef4444";
  }
}

// ฟังก์ชันดาวน์โหลด Log ออกมาเป็นไฟล์ .txt
function downloadLogFile() {
  const logText = logEl.value;
  
  if (!logText.trim()) {
    alert("❗ ไม่มีข้อมูล Log ให้ดาวน์โหลด");
    return;
  }

  const blob = new Blob([logText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  const now = new Date();
  const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
  
  link.href = url;
  link.download = `esp32_flash_log_${timestamp}.txt`;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ฟังก์ชันล้างข้อความใน Console
function clearLogConsole() {
  if (confirm("คุณต้องการล้างข้อความ Log ทั้งหมดใช่หรือไม่?")) {
    logEl.value = "";
  }
}

// ผูก Event Listeners เข้ากับปุ่มควบคุม
document.getElementById("connect").addEventListener("click", connectESP);
document.getElementById("flash").addEventListener("click", flashESP);
document.getElementById("downloadLog").addEventListener("click", downloadLogFile);
document.getElementById("clearLog").addEventListener("click", clearLogConsole);