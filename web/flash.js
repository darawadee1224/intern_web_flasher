// web/flash.js
import * as esptool from "https://unpkg.com/esptool-js@0.5.4/bundle.js";

let chip;
let port;
let transport;

// ดึงตัวแปรอินเทอร์เฟซและหลอดแสดงสถานะจากหน้าเว็บ HTML
const logEl = document.getElementById("log");
const progressBar = document.getElementById("progressBar");
const progressPercent = document.getElementById("progressPercent");
const progressStatus = document.getElementById("progressStatus");

const connectBtn = document.getElementById("connect");
const disconnectBtn = document.getElementById("disconnect");
const flashBtn = document.getElementById("flash");

// ฟังก์ชันแสดงผลข้อความสถานะออกหน้าต่าง System Console
const log = (msg) => {
  logEl.value += msg + "\n";
  logEl.scrollTop = logEl.scrollHeight;
};

// ฟังก์ชันเปิดการเชื่อมต่อพอร์ตฮาร์ดแวร์ (CONNECT PORT)
async function connectESP() {
  try {
    log("🔌 กำลังเปิดหน้าต่างเลือกพอร์ต Serial...");
    port = await navigator.serial.requestPort();

    transport = new esptool.Transport(port);
    
    const baudRate = parseInt(document.getElementById("baudRate").value);
    
    // สร้าง ESPLoader พร้อมใส่เมธอด Terminal ครบสเปกเพื่อสยบบั๊กทั้งหมด
    chip = new esptool.ESPLoader({
      transport: transport,
      baudrate: baudRate,
      terminal: {
        write: (msg) => log(msg),
        writeLine: (msg) => log(msg), 
        clean: () => {},              
        clear: () => {}               
      }
    });

    log("🔄 กำลังเริ่มต้นเชื่อมต่อกับ Chip (⚡ Connecting...)");
    await chip.main();
    log("✅ เชื่อมต่อสำเร็จ!");

    // สลับสถานะของปุ่มเมื่อควบคุมพอร์ตติด
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
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
  }
}

// ฟังก์ชันปิดการเชื่อมต่อพอร์ตอย่างปลอดภัย (DISCONNECT)
async function disconnectESP() {
  try {
    log("🔄 กำลังดำเนินการปิดพอร์ต Serial...");
    if (transport && typeof transport.disconnect === "function") {
      await transport.disconnect();
    }

    if (port) {
      if (port.readable) {
        await port.close();
      }
      port = null;
    }

    chip = null;
    transport = null;

    log("🔌 ตัดการเชื่อมต่อเรียบร้อยแล้ว");
    progressStatus.innerText = "Ready to Connect";
    progressStatus.style.color = "#64748b";
    
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    progressBar.value = 0;
    progressPercent.innerText = "0%";
  } catch (e) {
    log(`❌ เกิดข้อผิดพลาดขณะตัดการเชื่อมต่อ: ${e.message || e}`);
    chip = null;
    transport = null;
    port = null;
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
  }
}

// ฟังก์ชันอ่านคุณลักษณะทางกายภาพของชิปมาแสดงผล
async function readChipInfo() {
  if (!chip) {
    log("❗ ไม่พบอุปกรณ์ที่เชื่อมต่อ");
    return;
  }

  try {
    const chipName = chip.chipName || "ESP32 Device";
    log("=== ข้อมูล Chip ล่าสุด ===");
    log(`Name        : ${chipName}`);

    if (typeof chip.readMac === "function") {
      const mac = await chip.readMac();
      const macStr = Array.from(mac)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(":");
      log(`MAC Address : ${macStr}`);
    }

    log("=========================");
    progressStatus.innerText = `Connected to ${chipName}`;
    progressStatus.style.color = "#3b82f6";
  } catch (err) {
    log(`❌ อ่านข้อมูล Chip ล้มเหลว: ${err}`);
  }
}

// ฟังก์ชันหลักในการแฟลชไฟล์ .bin พร้อมคำนวณสถานะหลอดไฟแบบเรียลไทม์
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
      //เปลี่ยนมาใช้วิธีอ่านไฟล์แบบ Binary String ตามข้อกำหนดของ esptool-js 0.5.4
      const fileBlob = file.input.files[0];
      const binData = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsBinaryString(fileBlob); // บังคับอ่านค่าเป็นสตริงไบนารี
      });

      validFiles.push({
      addr: addrInt,
      data: binData, // ส่งก้อนข้อมูล String ไปให้ chip.writeFlash อ่านค่าได้ถูกต้อง
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

    // เริ่มต้นสถานะ Progress Bar ก่อนเขียนไฟล์
    progressBar.value = 0;
    progressPercent.innerText = "0%";

    // ใช้ writeFlash รูปแบบอ็อบเจกต์ที่ถูกต้องใน index.html
    for (let i = 0; i < validFiles.length; i++) {
      const currentFile = validFiles[i];
      log(`⚡ กำลังแฟลชที่ 0x${currentFile.addr.toString(16)} (${currentFile.data.length} bytes)...`);
      
      // ตรวจสอบลูป For เขียนไฟล์ด้านล่างให้เรียกใช้งานแบบนี้ครับ
    await chip.writeFlash({
      fileArray: [{ data: currentFile.data, address: currentFile.addr }],
      flashSize: 'keep',
      flashMode: 'keep',
      flashFreq: 'keep',
      eraseAll: false,
      compress: true,
        reportProgress: (bytesWritten, totalBytes) => {
          let fileProgress = 0;
if (totalBytes && totalBytes > 0) {
  fileProgress = bytesWritten / totalBytes;
}

      let totalProgress = ((i + fileProgress) / validFiles.length) * 100;

      // ดักจับจังหวะสุดท้าย: ถ้าคำนวณผิดพลาดให้เซ็ตเป็นตัวเลข 0 หรือเช็คความถูกต้องก่อนใส่หน้า UI
      if (isNaN(totalProgress) || !isFinite(totalProgress)) {
        totalProgress = 0;
      }

      // อัปเดต UI หลอด FLASHING STATUS และตัวเลขเปอร์เซ็นต์อย่างปลอดภัย
      progressBar.value = totalProgress;
      progressPercent.innerText = `${Math.round(totalProgress)}%`;
      progressStatus.innerText = `💾 กำลังเขียน (${i + 1}/${validFiles.length}): ${currentFile.name} [${Math.round(fileProgress * 100)}%]`;
      progressStatus.style.color = "#0ea5e9";
      }
  });
}

  // ใช้ reset ด้วยวิธีตัดและเปิดพอร์ตใหม่ตามสเปก หรือใช้ resetWithFlashMode()
  if (chip.resetWithFlashMode) {
    await chip.resetWithFlashMode();
  } else {
  // หากเวอร์ชันไม่มี ให้สั่ง hardReset ผ่าน transport ที่ผูกกับพอร์ตโดยตรง
    await transport.setDTR(false);
    await new Promise((res) => setTimeout(res, 100));
    await transport.setDTR(true);
}
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
    // คืนค่าสถานะปุ่มกดกลับมาให้พร้อมใช้งานตามเดิม
    flashBtn.disabled = false;
    disconnectBtn.disabled = false;
  }
}

// ฟังก์ชันสร้างประวัติระบบดาวน์โหลดออกมาเป็นเอกสาร .txt
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

// ฟังก์ชันเคลียร์หน้าจอ Console
function clearLogConsole() {
  if (confirm("คุณต้องการล้างข้อความ Log ทั้งหมดใช่หรือไม่?")) {
    logEl.value = "";
  }
}

// ผูก Listeners ทั้งหมดเข้ากับโครงสร้างอินเทอร์เฟซอย่างเป็นระบบ
connectBtn.addEventListener("click", connectESP);
disconnectBtn.addEventListener("click", disconnectESP);
flashBtn.addEventListener("click", flashESP);
document.getElementById("downloadLog").addEventListener("click", downloadLogFile);
document.getElementById("clearLog").addEventListener("click", clearLogConsole);