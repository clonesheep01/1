# Little World RPG — bản ghép hoàn chỉnh

Bản này lấy dự án 15 hệ + Battle làm nền chính, sau đó đối chiếu với gói Adventure.
Các file trùng chức năng được giữ một bản duy nhất để tránh xung đột.

## Đã giữ
- Bản đồ, di chuyển, NPC và vùng cỏ từ dự án RPG.
- 15 sinh vật và 15 hệ nguyên tố trong `src/game/creatures.ts`.
- Sprite sinh vật, chiến đấu, kỹ năng đặc biệt và hiệu ứng trong `src/Battle.tsx`.
- Bắt sinh vật, đội hình tối đa 6, kho lưu trữ, EXP và lưu dữ liệu.
- Giao diện khám phá và các màn quản lý trong `src/App.tsx`.

## Đã loại trùng
Gói Adventure có một hệ sinh vật/chiến đấu phụ 5 hệ trong `src2/`.
Không chép hệ phụ này vào bản cuối vì nó trùng và xung đột với hệ 15 hệ trong `src/game/`.
Bản đồ và vòng lặp khám phá đã có trong dự án nền nên không thay bằng bản GameEngine cũ hơn.

## Chạy
```bash
npm install
npm run dev
```
Build kiểm tra:
```bash
npm run build
```

Lưu ý: gói đã được ghép file và kiểm tra cấu trúc. Việc cài npm trong môi trường tạo file bị timeout nên chưa xác nhận được build Vite thực tế.
