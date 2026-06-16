import * as esptool from "https://unpkg.com/esptool-js/lib/index.js";

let chip;
let port;

const logEl = document.getElementById("log");
const progressBar = document.getElementById("progressBar");

const log = (msg) => {
  logEl.value += msg + "\n";
  logEl.scrollTop = logEl.scrollHeight;
};

// เชื่อมต่อ ESP32
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

// อ่านข้อมูล Chip
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

    // อ่าน MAC Address ถ้าไลบรารีรองรับ
    if (typeof chip.readMac === "function") {
      const mac = await chip.readMac();
      const macStr = Array.from(mac)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(":");
      log(`MAC Address : ${macStr}`);
    }

    log("=========================");
  } catch (err) {
    log(`❌ อ่านข้อมูล Chip ล้มเหลว: ${err}`);
  }
}

// แฟลชไฟล์
async function flashESP() {
  if (!chip) {
    log("❗ กรุณาเชื่อมต่อก่อนแฟลช");
    return;
  }

  const files = [
    {
      input: document.getElementById("bootloader"),
      addr: document.getElementById("bootloaderAddr").value.trim(),
    },
    {
      input: document.getElementById("partitions"),
      addr: document.getElementById("partitionsAddr").value.trim(),
    },
    {
      input: document.getElementById("firmware"),
      addr: document.getElementById("firmwareAddr").value.trim(),
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
      validFiles.push([addrInt, new Uint8Array(binData)]);
    }
  }

  if (!validFiles.length) {
    log("❗ ไม่มีไฟล์ที่ถูกต้องสำหรับแฟลช");
    return;
  }

  try {
    log("⚠️ ลบข้อมูล Flash...");
    await chip.eraseFlash();

    progressBar.value = 0;
    for (let i = 0; i < validFiles.length; i++) {
      const [addr, data] = validFiles[i];
      log(`⚡ กำลังแฟลชที่ 0x${addr.toString(16)} (${data.length} bytes)...`);
      await chip.flashData(data, addr);
      progressBar.value = ((i + 1) / validFiles.length) * 100;
    }

    await chip.hardReset();
    await new Promise((res) => setTimeout(res, 500));
    log("✅ แฟลช Firmware เสร็จสมบูรณ์!");
    progressBar.value = 100;
  } catch (err) {
    log(`❌ แฟลชล้มเหลว: ${err}`);
    progressBar.value = 0;
  }
}

// Event listeners
document.getElementById("connect").addEventListener("click", connectESP);
document.getElementById("flash").addEventListener("click", flashESP);
