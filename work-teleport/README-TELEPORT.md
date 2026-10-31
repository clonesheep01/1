# TELEPORT nhanh — Little World RPG

## Đã tích hợp
- Nút `✦ TELEPORT` nằm cố định phía trên góc phải khung game.
- Chọn nhanh các bản đồ thật đang có: `town`, `meadow`, `forest`.
- Chỉ hiện bản đồ đã mở khóa. Bản đồ được mở khóa khi người chơi đi qua portal/cửa cũ lần đầu.
- WASD và cơ chế portal cũ vẫn hoạt động.
- Teleport đặt nhân vật ở điểm spawn an toàn, kiểm tra va chạm với obstacle.
- Lưu `mapId`, `x`, `y`, `unlockedMaps` vào LocalStorage cùng save game hiện tại.
- Vị trí được cập nhật tối đa mỗi giây khi di chuyển; chuyển map/teleport lưu ngay.
- Có hiệu ứng chuyển cảnh Pixel Art ngắn.

## Các file đã sửa
- `src/game/save.ts`
- `src/game/GameEngine.ts`
- `src/App.tsx`
- `src/styles.css`

## Kiểm tra
Đã chạy TypeScript strict check thành công cho các module game:
`maps.ts`, `creatures.ts`, `save.ts`, `GameEngine.ts`.
Không chạy được full Vite build trong môi trường đóng gói vì `npm install` không hoàn tất trước thời hạn, nên cần kiểm tra `npm run build` trong StackBlitz sau khi import ZIP.

## Dùng trong StackBlitz
1. Giải nén ZIP và tải các file đã sửa vào đúng vị trí trong dự án (hoặc mở ZIP làm dự án mới).
2. Chạy `npm install` nếu StackBlitz chưa tự cài dependencies.
3. Chạy Preview.
4. Khám phá qua portal để mở khóa Meadow/Forest; sau đó nút TELEPORT sẽ cho chọn những khu vực đã mở khóa.
