import * as esptool from "https://unpkg.com/esptool-js@0.5.4/bundle.js";

let chip;
let port;
let transport;

const logEl = document.getElementById("log");
const progressBar = document.getElementById("progressBar");
const progressPercent = document.getElementById("progressPercent");
const progressStatus = document.getElementById("progressStatus");

// ดึงตัวแปรปุ่มควบคุมพอร์ต
const connectBtn = document.getElementById("connect");
const disconnectBtn = document.getElementById("disconnect");
const flashBtn = document.getElementById("flash");

// ฟังก์ชัน Log ข้อความออกหน้าคอนโซล
const log = (msg) => {
  logEl.value += msg + "\n";
  logEl.scrollTop = logEl.scrollHeight;
};

// ฟังก์ชันเชื่อมต่อพอร์ต Serial (ปุ่ม CONNECT PORT)
async function connectESP() {
  try {
    log("🔌 กำลังเปิดหน้าต่างเลือกพอร์ต Serial...");
    port = await navigator.serial.requestPort();

    transport = new esptool.Transport(port);
    
    const baudRate = parseInt(document.getElementById("baudRate").value);

    // สร้าง ESPLoader พร้อมใส่เมธอดของ terminal ครบทุกสเปกเพื่อป้องกัน Error ทั้งหมด
    chip = new esptool.ESPLoader({
      transport: transport,
      baudrate: baudRate,
      terminal: {
        write: (msg) => log(msg),
        writeLine: (msg) => log(msg), // แก้บั๊ก writeLine is not a function
        clean: () => {},              // แก้บั๊ก clean is not a function
        clear: () => {}               // ดักจับฟังก์ชันเคลียร์หน้าจอเผื่อระบบเรียกใช้งาน
      }
    });

    log("🔄 กำลังเริ่มต้นเชื่อมต่อกับ Chip (⚡ Connecting...)");
    await chip.main();
    log("✅ เชื่อมต่อสำเร็จ!");

    // ปรับปรุงสถานะปุ่มเมื่อเชื่อมต่อติด
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;

    await readChipInfo();
  } catch (e) {
    if (e.name === "NotFoundError") {
      log("❗ ยังไม่ได้เลือกพอร์ต Serial กรุณาเลือกอุปกรณ์");
    } else if (e.name === "InvalidStateError") {
      log("❗ พอร์ต Serial ยังเปิดอยู่ กรุณาปิดก่อนเชื่อมต่อใหม่");
    } else {
      log(`❌ เกิดข้อผิดพลาด: ${e.message || e}`);
    }
    
    // คืนค่าปุ่มหากกระบวนการล้มเหลว
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
  }
}

// ฟังก์ชันตัดการเชื่อมต่อพอร์ตฮาร์ดแวร์ (ปุ่ม DISCONNECT)
async function disconnectESP() {
  if (port && port.readable) {
    try {
      log("🔄 กำลังดำเนินการปิดพอร์ต Serial...");
      
      chip = null; 
      await port.close();
      port = null;
      transport = null;

      log("🔌 ตัดการเชื่อมต่อเรียบร้อยแล้ว");
      progressStatus.innerText = "Ready to Connect";
      progressStatus.style.color = "#64748b";
      
      // คืนค่าปุ่มให้กลับมาพร้อมเริ่มเชื่อมต่อใหม่
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
      progressBar.value = 0;
      progressPercent.innerText = "0%";
    } catch (e) {
      log(`❌ เกิดข้อผิดพลาดขณะตัดการเชื่อมต่อ: ${e.message || e}`);
    }
  } else {
    log("❗ ไม่มีพอร์ตเชื่อมต่อที่ค้างอยู่ในระบบ");
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
    // ล็อกปุ่มระหว่างแฟลชเพื่อความปลอดภัยของฮาร์ดแวร์
    flashBtn.disabled = true;
    disconnectBtn.disabled = true;

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
      
      await chip.flashData(currentFile.data, (bytesWritten, totalBytes) => {
        const fileProgress = bytesWritten / totalBytes;
        const totalProgress = ((i + fileProgress) / validFiles.length) * 100;
        
        progressBar.value = totalProgress;
        progressPercent.innerText = `${Math.round(totalProgress)}%`;
        progressStatus.innerText = `💾 กำลังเขียน (${i + 1}/${validFiles.length}): ${currentFile.name} [${Math.round(fileProgress * 100)}%]`;
        progressStatus.style.color = "#0ea5e9";
      }, currentFile.addr);
    }

    await chip.hardReset();
    await new Promise((res) => setTimeout(res, 500));
    
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
  } finally {
    // คืนค่าปุ่มหลังจบกระบวนการ
    flashBtn.disabled = false;
    disconnectBtn.disabled = false;
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

// ผูก Event Listeners เข้ากับปุ่มควบคุมทั้งหมด
connectBtn.addEventListener("click", connectESP);
disconnectBtn.addEventListener("click", disconnectESP);
flashBtn.addEventListener("click", flashESP);
document.getElementById("downloadLog").addEventListener("click", downloadLogFile);
document.getElementById("clearLog").addEventListener("click", clearLogConsole);