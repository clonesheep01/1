# Little World RPG — bản hoàn chỉnh

## Nội dung
- Bản đồ khám phá gốc: Thị trấn Mộc Miên, đồng cỏ và khu rừng; di chuyển, NPC, vùng cỏ và cổng bản đồ.
- Một bộ dữ liệu duy nhất gồm **15 sinh vật / 15 nguyên tố** trong `src/game/creatures.ts`.
- Chiến đấu theo lượt: hai sinh vật đối diện, HP, cấp độ, animation, Tấn công, Kỹ năng, Vật phẩm và Chạy trốn.
- Sát thương tính theo ATK, DEF, hệ nguyên tố và biến thiên nhỏ.
- Bắt sinh vật bằng quả cầu; tỉ lệ tăng khi HP đối thủ thấp.
- Thắng trận nhận EXP, lên cấp và vật phẩm; thua có màn hình riêng.
- Đội hình tối đa 6, kho sinh vật, bách khoa và tự động lưu tiến trình.
- Tương thích save cũ: tự bổ sung túi vật phẩm khi tải dữ liệu đã lưu.

## Chạy dự án
```bash
npm install
npm run dev
```
Mở URL mà Vite hiển thị.

## Kiểm tra bản build
```bash
npm run build
```

## Cấu trúc quan trọng
- `src/App.tsx`: màn khám phá và kết nối cuộc chạm trán.
- `src/Battle.tsx`: toàn bộ vòng lặp chiến đấu theo lượt.
- `src/game/creatures.ts`: dữ liệu 15 sinh vật, kỹ năng và tương khắc (không nhân bản).
- `src/game/maps.ts`, `src/game/GameEngine.ts`: bản đồ và điều khiển.
- `src/game/save.ts`: lưu/tải đội hình và túi vật phẩm.
- `src/CreatureSprite.tsx`: hình ảnh sinh vật dạng SVG.

## Ghi chú kiểm thử
Đã rà soát luồng xử lý từng nút trong Battle: Tấn công, mở Kỹ năng, dùng từng kỹ năng, mở Vật phẩm, dùng thuốc, ném quả cầu, chạy trốn và tiếp tục sau kết quả. Không thể giả lập tương tác trình duyệt đầy đủ trong môi trường đóng gói; hãy chạy `npm run build` và thử trực tiếp trong trình duyệt.
