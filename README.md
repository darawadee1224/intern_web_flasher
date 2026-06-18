# ESP32 Web Flasher

## รายละเอียดโครงการ

ESP32 Web Flasher เป็นเครื่องมือสำหรับแฟลชเฟิร์มแวร์ลงบอร์ด ESP32 ผ่านเว็บเบราว์เซอร์ โดยใช้ Web Serial API ร่วมกับไลบรารี `esptool-js` ทำให้สามารถเชื่อมต่อพอร์ตซีเรียล, อ่านข้อมูลชิป, ลบแฟลช, และเขียนไฟล์ `.bin` ได้จากอินเทอร์เฟซบนเว็บ

## ฟังก์ชันหลัก

- เชื่อมต่อกับ ESP32 ผ่าน `navigator.serial.requestPort()` และ Web Serial API
- เลือกค่า Baud Rate ได้จาก UI (115200, 230400, 460800, 921600)
- อ่านข้อมูลชิปหลังเชื่อมต่อ และแสดงชื่อชิปพร้อม MAC Address
- รองรับการแฟลชไฟล์ `.bin` สำหรับ:
  - bootloader
  - partitions
  - firmware
- กำหนดค่า Address ในรูปแบบ `0x...` สำหรับแต่ละไฟล์
- ลบข้อมูล Flash ก่อนเริ่มเขียนแฟลช
- แสดงสถานะการแฟลชแบบเรียลไทม์ พร้อม progress bar และข้อความสถานะ
- รีเซ็ตบอร์ดหลังแฟลชเสร็จ (ผ่าน `resetWithFlashMode` หรือ DTR reset)
- ดาวน์โหลด Log เป็นไฟล์ `.txt`
- ล้างหน้าจอ Log ได้ทันที

## วิธีใช้งาน

1. เปิดเว็บอินเทอร์เฟซของโปรเจกต์
2. เลือก Baud Rate ที่ต้องการ
3. กดปุ่ม `CONNECT PORT` เพื่อเลือกพอร์ต Serial ของ ESP32
4. เลือกไฟล์ `.bin` สำหรับ bootloader, partitions, firmware
5. ตรวจสอบว่า Address ถูกต้อง เช่น
   - bootloader: `0x0000`
   - partitions: `0x8000`
   - firmware: `0x10000`
6. กดปุ่ม `FLASH FIRMWARE` เพื่อเริ่มกระบวนการแฟลช
7. รอจน progress bar ถึง 100% และระบบแจ้งว่าแฟลชเสร็จเรียบร้อย
8. กดปุ่ม `DISCONNECT PORT` เพื่อตัดการเชื่อมต่อพอร์ตของESP32ที่เลือกไว้ 
9. หากต้องการบันทึกข้อมูลการทำงาน ให้กด `DOWNLOAD LOG`
10. หากต้องการล้างหน้าจอ Log ให้กด `CLEAR`

## วิธีติดตั้ง

1. Clone repository
2. ติดตั้ง dependencies

```bash
npm install
```

3. รันโปรแกรม

```bash
npm run dev
```

## โครงสร้างโปรเจกต์

- `web/index.html` - หน้า UI ของแอปพลิเคชัน
- `web/flash.js` - โค้ดควบคุมการเชื่อมต่อ, แฟลช, และ Log
- `web/style.css` - รูปแบบและการจัดวางหน้าเว็บ

## เทคโนโลยีที่ใช้

- Web Serial API
- esptool-js
- HTML/CSS/JavaScript

## ผู้พัฒนา

นักศึกษาสหกิจศึกษา รุ่น 2569