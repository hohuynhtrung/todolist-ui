# Thiết kế database Todoist clone

## 1. Tổng quan

Thiết kế này dành cho ứng dụng Todoist clone phục vụ bài tập, dùng PostgreSQL và Prisma ORM 7. Mục tiêu là lưu tài khoản an toàn, tổ chức công việc theo project/section, hỗ trợ sub-task, label, ưu tiên, hạn hoàn thành, lặp lại, bình luận, lịch sử hoàn thành và truy vấn thống kê.

Tên bảng theo dạng số ít, PascalCase, trùng tên model Prisma; tên cột theo `camelCase`. ID dùng UUID v7 (`uuid(7)`: sắp xếp được theo thời gian tạo nên index gọn hơn UUID v4). Các thời điểm sự kiện là `timestamptz` lưu theo UTC; ngày/giờ đến hạn của task là ngày/giờ địa phương theo múi giờ IANA của user (`User.timezone`).

### Phạm vi tính năng

| Chức năng chọn                                                        | Lý do và dữ liệu phục vụ                                                                                                                                          |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Đăng ký, đăng nhập, xác thực email, đặt lại mật khẩu, phiên đăng nhập | Bắt buộc theo đề bài; cần `User`, `EmailVerificationToken`, `PasswordResetToken`, `Session`.                                                                      |
| Tạo và quản lý project, Inbox và section                              | Đây là cách tổ chức công việc nền tảng; dùng `Project`, `Section` (section là tùy chọn).                                                                          |
| Tạo, sửa, hoàn thành, mở lại và sắp xếp task                          | Luồng công việc chính; dùng `Task` với trạng thái, `position`, soft delete và thời gian hoàn thành.                                                               |
| Sub-task                                                              | Cần quan hệ tự tham chiếu trên `Task`.                                                                                                                            |
| Priority, due date/time và recurring task                             | Là các trường lập kế hoạch cốt lõi; lưu trên `Task` (`dueDate` tách khỏi `dueTime` để phân biệt task cả ngày), lịch sử mỗi lần hoàn thành nằm ở `TaskCompletion`. |
| Label gắn nhiều task và comment trong task                            | Hỗ trợ phân loại và trao đổi tối thiểu; dùng `Label`, `TaskLabel`, `Comment`.                                                                                     |
| Thống kê theo ngày, tuần, project; công việc quá hạn                  | `TaskCompletion` lưu sự kiện hoàn thành để thống kê lịch sử, không chỉ dựa vào trạng thái hiện tại.                                                               |
| Quyền `USER`/`ADMIN`, khóa tài khoản                                  | Dùng enum trên `User`; mọi thao tác quản trị được ghi vào `AuditLog`.                                                                                             |

Không làm trong phạm vi này: thanh toán/gói dịch vụ, AI, tích hợp bên thứ ba, chia sẻ/team workspace nhiều thành viên, file đính kèm, reminder/notification, automation, filter tùy biến và đồng bộ đa thiết bị. Các view như Today/Upcoming có thể dựng từ truy vấn task, chưa cần bảng riêng.

### Nghiên cứu chức năng công khai

Trang Todoist giới thiệu việc gom task theo project, section, sub-task, deadline và thứ tự; Help Center có các nhóm tài liệu riêng cho projects/sections, tasks, recurring dates, comments, priority, labels và các kiểu sắp xếp. Thiết kế chỉ chọn các phần cần cho ứng dụng cá nhân trong bài tập; không sao chép các chức năng phụ trợ/đội nhóm.

- [Todoist Features](https://www.todoist.com/features)
- [Todoist Help Center — Features](https://www.todoist.com/help/todoist/features)
- [Introduction to projects](https://www.todoist.com/help/todoist/features/introduction-to-projects-TLTjNftLM)

## 2. ERD và quyết định thiết kế

```text
User 1 ── N Project 1 ── N Section (tùy chọn)
  │             │              │
  │             └──── N Task ──┘        (Task.sectionId có thể NULL)
  │                       │
  │                       ├── 1 ── N Task (parentTask / subtasks, cùng project)
  │                       ├── N ── M Label (qua TaskLabel)
  │                       ├── 1 ── N Comment
  │                       └── 1 ── N TaskCompletion
  ├── N Label
  ├── N EmailVerificationToken
  ├── N PasswordResetToken
  ├── N Session (nhóm theo familyId)
  ├── N Comment (tác giả) / TaskCompletion
  └── N AuditLog (actor quản trị, có thể NULL)
```

`Role`, `AccountStatus`, `TaskStatus` là PostgreSQL enum, không phải bảng. Với ứng dụng hiện tại, các miền giá trị này nhỏ, ổn định và không cần CRUD riêng; enum giúp giới hạn giá trị hợp lệ ngay ở database.

`Task.userId` được lưu tường minh để mọi truy vấn task lọc trực tiếp theo chủ sở hữu. `projectId` cũng được lưu trên task để truy vấn đơn giản và tạo khóa ngoại ghép kiểm tra project thuộc đúng user; đây là dư thừa có chủ đích, được duy trì nhất quán bằng composite foreign key. `TaskCompletion.projectId` là snapshot project tại thời điểm hoàn thành để việc chuyển task sang project khác không làm đổi số liệu lịch sử.

**Sub-task luôn cùng project với task cha.** Khóa ngoại ghép `(parentTaskId, projectId) → Task(id, projectId)` khiến PostgreSQL từ chối sub-task trỏ tới cha ở project khác (và vì cùng project nên cũng cùng user). Hệ quả: chuyển task cha sang project khác phải chuyển cả cây con trong cùng một câu `UPDATE` (mục 8). FK dùng `NO ACTION`, tức được kiểm tra sau khi cả câu lệnh chạy xong, nên thao tác đó không bị chặn.

**Section là tùy chọn.** `Task.sectionId` có thể NULL (task không thuộc section nào, ví dụ mọi task trong Inbox). Khóa ghép `(sectionId, projectId)` chỉ được kiểm khi `sectionId` có giá trị; khi đó section bắt buộc thuộc đúng project của task. Cách này tránh phải tạo section mặc định ẩn cho mỗi project.

**Ngày đến hạn tách `dueDate` và `dueTime`.** Task có thể chỉ có ngày (cả ngày) hoặc có cả giờ; một cột `timestamptz` không phân biệt được hai loại này nên task "hôm nay" sẽ bị tính quá hạn từ 00:00. Thiết kế dùng `dueDate` (`date`) và `dueTime` (`time`, NULL = cả ngày), đều là giờ địa phương theo `User.timezone`. Task cả ngày chỉ quá hạn từ ngày hôm sau.

**`position` là `integer`.** Prisma trả `bigint` về JavaScript dưới dạng `BigInt`, và `JSON.stringify` ném `TypeError` với kiểu này nên mọi response chứa `position` sẽ lỗi nếu quên chuyển đổi. `integer` (tối đa khoảng 2,1 tỷ) vẫn dư cho bước cách quãng 1024.

Mọi entity nghiệp vụ có UUID; bảng nối `TaskLabel` dùng khóa ghép tự nhiên. Bảng `TaskCompletion` là event log cho lần hoàn thành, vì một task recurring có thể hoàn thành nhiều lần. Event có cột `revertedAt`: khi mở lại một task không lặp, event tương ứng được đánh dấu hoàn tác thay vì bị xóa, nên hoàn thành → mở lại → hoàn thành lại chỉ được đếm một lần.

## 3. Chi tiết từng bảng

`PK` là khóa chính. `FK` là khóa ngoại. Các trường `createdAt`/`updatedAt` được cập nhật theo UTC; Prisma `@updatedAt` tự ghi lại `updatedAt` khi cập nhật bằng Prisma Client.

### `User`

| Cột               | PostgreSQL       |     Null | Default                       | Ràng buộc / mục đích                                                                                                                                                                      |
| ----------------- | ---------------- | -------: | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | `uuid`           | NOT NULL | Prisma `uuid(7)` (sinh ở ORM) | PK; định danh user.                                                                                                                                                                       |
| `email`           | `varchar(320)`   | NOT NULL | —                             | Unique; luôn chữ thường, được ép bằng CHECK `email = lower(email)` (mục 5). Khi xóa mềm tài khoản, email bị ghi đè bằng giá trị ẩn danh để giải phóng email và không giữ dữ liệu cá nhân. |
| `passwordHash`    | `varchar(255)`   | NOT NULL | —                             | Chỉ lưu hash mật khẩu.                                                                                                                                                                    |
| `displayName`     | `varchar(120)`   | NOT NULL | —                             | Tên hiển thị.                                                                                                                                                                             |
| `role`            | `Role`           | NOT NULL | `USER`                        | Quyền ứng dụng `USER`/`ADMIN`.                                                                                                                                                            |
| `accountStatus`   | `AccountStatus`  | NOT NULL | `ACTIVE`                      | Khóa/mở tài khoản.                                                                                                                                                                        |
| `emailVerifiedAt` | `timestamptz(3)` |     NULL | —                             | NULL nghĩa là chưa xác thực email.                                                                                                                                                        |
| `timezone`        | `varchar(64)`    | NOT NULL | `UTC`                         | Tên múi giờ IANA, ví dụ `Asia/Ho_Chi_Minh`.                                                                                                                                               |
| `createdAt`       | `timestamptz(3)` | NOT NULL | `now()`                       | Thời điểm tạo.                                                                                                                                                                            |
| `updatedAt`       | `timestamptz(3)` | NOT NULL | Tự cập nhật bởi Prisma        | Thời điểm cập nhật gần nhất.                                                                                                                                                              |
| `deletedAt`       | `timestamptz(3)` |     NULL | —                             | Soft delete; tài khoản xóa không thể đăng nhập.                                                                                                                                           |

### `EmailVerificationToken`

| Cột          | PostgreSQL       |     Null | Default                       | Ràng buộc / mục đích                                           |
| ------------ | ---------------- | -------: | ----------------------------- | -------------------------------------------------------------- |
| `id`         | `uuid`           | NOT NULL | Prisma `uuid(7)` (sinh ở ORM) | PK.                                                            |
| `userId`     | `uuid`           | NOT NULL | —                             | FK tới `User`; user sở hữu token.                              |
| `tokenHash`  | `char(64)`       | NOT NULL | —                             | Unique; SHA-256 hex của token ngẫu nhiên, không lưu token thô. |
| `expiresAt`  | `timestamptz(3)` | NOT NULL | —                             | Hạn dùng.                                                      |
| `consumedAt` | `timestamptz(3)` |     NULL | —                             | Đánh dấu đã dùng; chỉ chấp nhận nếu NULL.                      |
| `createdAt`  | `timestamptz(3)` | NOT NULL | `now()`                       | Thời điểm phát hành.                                           |

### `PasswordResetToken`

| Cột          | PostgreSQL       |     Null | Default                       | Ràng buộc / mục đích                      |
| ------------ | ---------------- | -------: | ----------------------------- | ----------------------------------------- |
| `id`         | `uuid`           | NOT NULL | Prisma `uuid(7)` (sinh ở ORM) | PK.                                       |
| `userId`     | `uuid`           | NOT NULL | —                             | FK tới `User`.                            |
| `tokenHash`  | `char(64)`       | NOT NULL | —                             | Unique; SHA-256 hex, không lưu token thô. |
| `expiresAt`  | `timestamptz(3)` | NOT NULL | —                             | Hạn ngắn, ví dụ 30 phút.                  |
| `consumedAt` | `timestamptz(3)` |     NULL | —                             | Chống sử dụng lại.                        |
| `createdAt`  | `timestamptz(3)` | NOT NULL | `now()`                       | Thời điểm phát hành.                      |

### `Session`

| Cột                | PostgreSQL       |     Null | Default                       | Ràng buộc / mục đích                                                                             |
| ------------------ | ---------------- | -------: | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `id`               | `uuid`           | NOT NULL | Prisma `uuid(7)` (sinh ở ORM) | PK.                                                                                              |
| `userId`           | `uuid`           | NOT NULL | —                             | FK tới `User`.                                                                                   |
| `familyId`         | `uuid`           | NOT NULL | —                             | Nhóm các phiên cùng một lần đăng nhập; mỗi lần rotate tạo phiên mới nhưng giữ nguyên `familyId`. |
| `refreshTokenHash` | `char(64)`       | NOT NULL | —                             | Unique; hash refresh token.                                                                      |
| `userAgent`        | `varchar(512)`   |     NULL | —                             | Thiết bị/trình duyệt, dùng cho màn hình "thiết bị đang đăng nhập".                               |
| `ipAddress`        | `varchar(45)`    |     NULL | —                             | IP đăng nhập (đủ chỗ cho IPv6).                                                                  |
| `expiresAt`        | `timestamptz(3)` | NOT NULL | —                             | Hạn phiên.                                                                                       |
| `revokedAt`        | `timestamptz(3)` |     NULL | —                             | Thu hồi phiên khi logout/đổi mật khẩu.                                                           |
| `lastUsedAt`       | `timestamptz(3)` |     NULL | —                             | Theo dõi lần dùng gần nhất.                                                                      |
| `createdAt`        | `timestamptz(3)` | NOT NULL | `now()`                       | Thời điểm tạo phiên.                                                                             |
| `updatedAt`        | `timestamptz(3)` | NOT NULL | Tự cập nhật bởi Prisma        | Thời điểm rotate/cập nhật phiên.                                                                 |

Phát hiện tái sử dụng refresh token: nếu một refresh token đã bị rotate/revoke mà vẫn được gửi lại, backend coi như token bị lộ và thu hồi toàn bộ phiên cùng `familyId` (`UPDATE ... SET revokedAt = now() WHERE familyId = ...`).

### `Project`

| Cột         | PostgreSQL       |     Null | Default                       | Ràng buộc / mục đích               |
| ----------- | ---------------- | -------: | ----------------------------- | ---------------------------------- |
| `id`        | `uuid`           | NOT NULL | Prisma `uuid(7)` (sinh ở ORM) | PK.                                |
| `userId`    | `uuid`           | NOT NULL | —                             | FK tới `User`; chủ sở hữu project. |
| `name`      | `varchar(120)`   | NOT NULL | —                             | Tên project.                       |
| `color`     | `varchar(32)`    |     NULL | —                             | Mã màu giao diện.                  |
| `isInbox`   | `boolean`        | NOT NULL | `false`                       | Đánh dấu Inbox duy nhất của user.  |
| `position`  | `integer`        | NOT NULL | `1024`                        | Thứ tự project trong sidebar.      |
| `createdAt` | `timestamptz(3)` | NOT NULL | `now()`                       | Thời điểm tạo.                     |
| `updatedAt` | `timestamptz(3)` | NOT NULL | Tự cập nhật bởi Prisma        | Thời điểm cập nhật.                |
| `deletedAt` | `timestamptz(3)` |     NULL | —                             | Soft delete.                       |

`@@unique([id, userId])` được dùng làm đích cho composite FK của task và completion. Inbox được tạo cùng tài khoản; unique partial index đảm bảo chỉ có một Inbox chưa xóa cho mỗi user.

### `Section`

| Cột         | PostgreSQL       |     Null | Default                       | Ràng buộc / mục đích          |
| ----------- | ---------------- | -------: | ----------------------------- | ----------------------------- |
| `id`        | `uuid`           | NOT NULL | Prisma `uuid(7)` (sinh ở ORM) | PK.                           |
| `projectId` | `uuid`           | NOT NULL | —                             | FK tới `Project`.             |
| `name`      | `varchar(120)`   | NOT NULL | —                             | Tên section.                  |
| `position`  | `integer`        | NOT NULL | `1024`                        | Thứ tự section trong project. |
| `createdAt` | `timestamptz(3)` | NOT NULL | `now()`                       | Thời điểm tạo.                |
| `updatedAt` | `timestamptz(3)` | NOT NULL | Tự cập nhật bởi Prisma        | Thời điểm cập nhật.           |
| `deletedAt` | `timestamptz(3)` |     NULL | —                             | Soft delete.                  |

Section là tùy chọn: task không thuộc section nào có `sectionId = NULL` (Inbox luôn như vậy). Quy ước của thiết kế: khi xóa mềm một section, backend xóa mềm luôn các task (và sub-task) trong section đó trong cùng transaction, thay vì để task mồ côi.

### `Task`

| Cột              | PostgreSQL       |     Null | Default                       | Ràng buộc / mục đích                                                                                                         |
| ---------------- | ---------------- | -------: | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `id`             | `uuid`           | NOT NULL | Prisma `uuid(7)` (sinh ở ORM) | PK.                                                                                                                          |
| `userId`         | `uuid`           | NOT NULL | —                             | FK `User`; cho phép scope truy vấn trực tiếp theo user.                                                                      |
| `projectId`      | `uuid`           | NOT NULL | —                             | FK ghép `Project(id,userId)`; không thể gắn task vào project của user khác.                                                  |
| `sectionId`      | `uuid`           |     NULL | —                             | FK ghép `Section(id,projectId)`; NULL nếu task không thuộc section nào. Khi có giá trị, section phải thuộc project của task. |
| `parentTaskId`   | `uuid`           |     NULL | —                             | FK ghép tự tham chiếu `Task(id,projectId)`; NULL nếu không phải sub-task. Cha và con luôn cùng project.                      |
| `title`          | `varchar(500)`   | NOT NULL | —                             | Nội dung task.                                                                                                               |
| `description`    | `text`           |     NULL | —                             | Mô tả chi tiết.                                                                                                              |
| `status`         | `TaskStatus`     | NOT NULL | `TODO`                        | `TODO`, `IN_PROGRESS`, `COMPLETED`.                                                                                          |
| `priority`       | `smallint`       | NOT NULL | `4`                           | CHECK `1..4`; `1` cao nhất, `4` thấp nhất.                                                                                   |
| `dueDate`        | `date`           |     NULL | —                             | Ngày đến hạn (giờ địa phương theo `User.timezone`).                                                                          |
| `dueTime`        | `time(0)`        |     NULL | —                             | Giờ đến hạn; NULL nghĩa là task cả ngày. CHECK: chỉ có giá trị khi `dueDate` có giá trị.                                     |
| `recurrenceRule` | `text`           |     NULL | —                             | Quy tắc lặp RFC 5545 RRULE do ứng dụng kiểm tra/diễn giải.                                                                   |
| `position`       | `integer`        | NOT NULL | `1024`                        | Thứ tự trong section (hoặc trong nhóm "không section" của project), dùng số cách quãng để kéo-thả.                           |
| `completedAt`    | `timestamptz(3)` |     NULL | —                             | Thời điểm hoàn thành hiện tại; NULL khi chưa hoàn thành/đã mở lại.                                                           |
| `createdAt`      | `timestamptz(3)` | NOT NULL | `now()`                       | Thời điểm tạo.                                                                                                               |
| `updatedAt`      | `timestamptz(3)` | NOT NULL | Tự cập nhật bởi Prisma        | Thời điểm cập nhật.                                                                                                          |
| `deletedAt`      | `timestamptz(3)` |     NULL | —                             | Soft delete; mặc định không xuất hiện trong danh sách.                                                                       |

`@@unique([id,userId])` là đích của FK ghép từ `TaskLabel`, `Comment` và `TaskCompletion`; `@@unique([id,projectId])` là đích của FK ghép sub-task. Database đảm bảo task cha tồn tại và cùng project (nên cũng cùng user); backend vẫn phải chặn chu trình (A → B → A) và giới hạn độ sâu. Check constraint ngăn task tự làm parent của chính nó.

`dueDate`/`dueTime` là ngày/giờ "treo" theo múi giờ của user: nếu user đổi `User.timezone`, các mốc này được hiểu theo múi giờ mới. Task cả ngày (`dueTime IS NULL`) chỉ quá hạn từ ngày hôm sau; task có giờ quá hạn khi giờ hiện tại theo múi giờ của user vượt `dueTime`.

### `Label`

| Cột         | PostgreSQL       |     Null | Default                       | Ràng buộc / mục đích                                                                                                        |
| ----------- | ---------------- | -------: | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `id`        | `uuid`           | NOT NULL | Prisma `uuid(7)` (sinh ở ORM) | PK.                                                                                                                         |
| `userId`    | `uuid`           | NOT NULL | —                             | FK tới `User`; label cá nhân.                                                                                               |
| `name`      | `varchar(80)`    | NOT NULL | —                             | Tên label; không phân biệt hoa thường trong cùng user (partial unique index theo `lower(name)` trên label chưa xóa, mục 5). |
| `color`     | `varchar(32)`    |     NULL | —                             | Màu hiển thị.                                                                                                               |
| `createdAt` | `timestamptz(3)` | NOT NULL | `now()`                       | Thời điểm tạo.                                                                                                              |
| `updatedAt` | `timestamptz(3)` | NOT NULL | Tự cập nhật bởi Prisma        | Thời điểm cập nhật.                                                                                                         |
| `deletedAt` | `timestamptz(3)` |     NULL | —                             | Soft delete.                                                                                                                |

### `TaskLabel`

| Cột         | PostgreSQL       |     Null | Default | Ràng buộc / mục đích                                      |
| ----------- | ---------------- | -------: | ------- | --------------------------------------------------------- |
| `taskId`    | `uuid`           | NOT NULL | —       | FK ghép tới `Task(id,userId)`.                            |
| `labelId`   | `uuid`           | NOT NULL | —       | FK ghép tới `Label(id,userId)`.                           |
| `userId`    | `uuid`           | NOT NULL | —       | Phần của hai FK ghép, bảo đảm task/label cùng chủ sở hữu. |
| `createdAt` | `timestamptz(3)` | NOT NULL | `now()` | Thời điểm gắn label.                                      |

PK ghép `(taskId,labelId)` ngăn gắn trùng một label vào task.

### `Comment`

| Cột         | PostgreSQL       |     Null | Default                       | Ràng buộc / mục đích                                                 |
| ----------- | ---------------- | -------: | ----------------------------- | -------------------------------------------------------------------- |
| `id`        | `uuid`           | NOT NULL | Prisma `uuid(7)` (sinh ở ORM) | PK.                                                                  |
| `taskId`    | `uuid`           | NOT NULL | —                             | FK ghép `Task(id,userId)`.                                           |
| `userId`    | `uuid`           | NOT NULL | —                             | FK tới `User`; tác giả, đồng thời ràng buộc comment cùng owner task. |
| `content`   | `text`           | NOT NULL | —                             | Nội dung comment.                                                    |
| `createdAt` | `timestamptz(3)` | NOT NULL | `now()`                       | Thời điểm tạo.                                                       |
| `updatedAt` | `timestamptz(3)` | NOT NULL | Tự cập nhật bởi Prisma        | Thời điểm sửa.                                                       |
| `deletedAt` | `timestamptz(3)` |     NULL | —                             | Soft delete comment.                                                 |

Giới hạn hiện tại: `userId` vừa là tác giả vừa là chủ task (chỉ chủ task được comment). Nếu sau này thêm chia sẻ project/team, cần tách tác giả khỏi chủ sở hữu.

### `TaskCompletion`

| Cột               | PostgreSQL       |     Null | Default                       | Ràng buộc / mục đích                                                                                                   |
| ----------------- | ---------------- | -------: | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `id`              | `uuid`           | NOT NULL | Prisma `uuid(7)` (sinh ở ORM) | PK cho từng sự kiện hoàn thành.                                                                                        |
| `taskId`          | `uuid`           | NOT NULL | —                             | FK ghép `Task(id,userId)`.                                                                                             |
| `userId`          | `uuid`           | NOT NULL | —                             | FK tới `User`; scope thống kê.                                                                                         |
| `projectId`       | `uuid`           | NOT NULL | —                             | FK ghép `Project(id,userId)`; snapshot project khi hoàn thành.                                                         |
| `completedAt`     | `timestamptz(3)` | NOT NULL | `now()`                       | Thời điểm ghi nhận hoàn thành.                                                                                         |
| `revertedAt`      | `timestamptz(3)` |     NULL | —                             | NULL = lần hoàn thành còn hiệu lực; có giá trị = đã bị hoàn tác do mở lại task. Mọi thống kê lọc `revertedAt IS NULL`. |
| `dueDateSnapshot` | `date`           |     NULL | —                             | Ngày đến hạn lúc hoàn thành, hỗ trợ thống kê đúng/trễ hạn theo lịch sử.                                                |
| `dueTimeSnapshot` | `time(0)`        |     NULL | —                             | Giờ đến hạn lúc hoàn thành (NULL nếu task cả ngày).                                                                    |

Event không bị xóa khi mở lại task; thay vào đó backend đặt `revertedAt = now()` cho event hoàn thành mới nhất chưa bị hoàn tác của task không lặp. Vì vậy hoàn thành → mở lại → hoàn thành lại chỉ được đếm một lần. Task lặp không bao giờ ở trạng thái COMPLETED, nên mỗi lần hoàn thành là một event độc lập. Nếu cần báo cáo "đang hoàn thành tại thời điểm hiện tại", truy vấn `Task.status`, không đếm event.

### `AuditLog`

| Cột          | PostgreSQL       |     Null | Default                       | Ràng buộc / mục đích                                                                                                 |
| ------------ | ---------------- | -------: | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`         | `uuid`           | NOT NULL | Prisma `uuid(7)` (sinh ở ORM) | PK.                                                                                                                  |
| `actorId`    | `uuid`           |     NULL | —                             | FK tới `User`; admin thực hiện thao tác. NULL nếu tài khoản đó bị xóa vật lý (`SET NULL`) hoặc thao tác do hệ thống. |
| `action`     | `varchar(64)`    | NOT NULL | —                             | Tên hành động, ví dụ `USER_LOCKED`, `USER_UNLOCKED`, `USER_ROLE_CHANGED`.                                            |
| `targetType` | `varchar(32)`    | NOT NULL | —                             | Loại đối tượng bị tác động, ví dụ `User`, `Task`.                                                                    |
| `targetId`   | `uuid`           |     NULL | —                             | ID đối tượng bị tác động.                                                                                            |
| `metadata`   | `jsonb`          |     NULL | —                             | Chi tiết bổ sung (giá trị cũ/mới, lý do). Không lưu mật khẩu hay token.                                              |
| `ipAddress`  | `varchar(45)`    |     NULL | —                             | IP của người thao tác.                                                                                               |
| `createdAt`  | `timestamptz(3)` | NOT NULL | `now()`                       | Thời điểm thao tác.                                                                                                  |

Bảng chỉ thêm, không sửa/xóa (append-only): API không có endpoint sửa hoặc xóa nhật ký.

## 4. Quan hệ và hành vi khi xóa

| Quan hệ                                                                            | Loại                         | FK / hành vi xóa vật lý                           | Vì sao                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User` → `Project`, `Task`, `Label`, `Session`, token, `Comment`, `TaskCompletion` | 1-N                          | `CASCADE`                                         | Các dữ liệu này thuộc user; xóa user vật lý chỉ dùng cho quy trình xóa dữ liệu hoàn tất. Mặc định dùng soft delete user.                                                                                                                                                   |
| `User` → `AuditLog`                                                                | 1-N (actor tùy chọn)         | `SET NULL`                                        | Giữ nhật ký quản trị ngay cả khi tài khoản actor bị xóa vật lý.                                                                                                                                                                                                            |
| `Project` → `Section`, `Task`, `TaskCompletion`                                    | 1-N                          | `CASCADE`                                         | Dữ liệu không còn ý nghĩa khi project bị xóa vật lý; thao tác thông thường là soft delete.                                                                                                                                                                                 |
| `Section` → `Task`                                                                 | 1-N (tùy chọn)               | `RESTRICT`                                        | Không xóa section vật lý khi task còn tham chiếu. Xóa mềm section kéo theo xóa mềm các task trong section (backend, cùng transaction).                                                                                                                                     |
| `Task` → `Task` (parent/children)                                                  | tự quan hệ 1-N, cùng project | `NO ACTION` (FK ghép `(parentTaskId, projectId)`) | Không cho xóa vật lý hoặc đổi project của task cha khi con còn tham chiếu. Vì kiểm tra diễn ra sau khi cả câu lệnh chạy xong, xóa cả project (cascade) hoặc chuyển cả cây sang project khác bằng một câu `UPDATE` vẫn chạy được. Xóa mềm cha → backend xóa mềm cả cây con. |
| `Task` → `TaskLabel`                                                               | 1-N                          | `CASCADE`                                         | Xóa liên kết label cùng task.                                                                                                                                                                                                                                              |
| `Label` → `TaskLabel`                                                              | 1-N                          | `CASCADE`                                         | Xóa liên kết khi label bị xóa vật lý.                                                                                                                                                                                                                                      |
| `Task` → `Comment`                                                                 | 1-N                          | `CASCADE`                                         | Comment không còn ngữ cảnh nếu task bị xóa vật lý.                                                                                                                                                                                                                         |
| `Task` → `TaskCompletion`                                                          | 1-N                          | `CASCADE`                                         | Event gắn với vòng đời task; soft delete task vẫn giữ lịch sử.                                                                                                                                                                                                             |
| `TaskLabel`                                                                        | N-M giữa `Task` và `Label`   | Hai FK ghép `CASCADE`                             | Bảng nối chuẩn hóa, bảo đảm hai phía cùng user.                                                                                                                                                                                                                            |

Với dữ liệu người dùng, project, section, task, label và comment, xóa mặc định là cập nhật `deletedAt`, không phải `DELETE`. `CASCADE` chỉ áp dụng khi thực sự hard-delete theo retention/administration.

Các hành vi xóa/chuyển ở bảng trên (xóa cả project có cây sub-task nhiều cấp, chuyển cả cây sang project khác, từ chối sub-task khác project) đã được chạy thử trên PostgreSQL 16 với bảng mô phỏng.

## 5. Index và ràng buộc

- PK trên mọi bảng; `email`, `tokenHash`, `refreshTokenHash` là unique.
- `Project @@unique([id,userId])`, `Section @@unique([id,projectId])`, `Task @@unique([id,userId])`, `Task @@unique([id,projectId])`, `Label @@unique([id,userId])` tạo đích hợp lệ cho khóa ngoại ghép.
- `TaskLabel` có PK `(taskId,labelId)` và index riêng cho hai composite FK `(taskId,userId)`, `(labelId,userId)`.
- Query task theo owner/trạng thái/xóa mềm được phục vụ bởi `(userId,status,deletedAt)`. Danh sách trong section dùng `(sectionId,projectId,deletedAt,position)`; danh sách theo project dùng `(projectId,userId,deletedAt,position)`; sub-task dùng `(parentTaskId,projectId)`.
- View Today/Upcoming và truy vấn quá hạn dùng `(userId,dueDate,deletedAt)`; lọc `deletedAt IS NULL` vẫn hoạt động qua index composite dù không phải partial index.
- `Section` có `(projectId,deletedAt,position)`; `Project` có `(userId,deletedAt,position)`.
- Token có index `(userId,expiresAt)`; `Session` có `(userId,revokedAt)`, `(expiresAt)` và `(familyId)` để thu hồi cả nhóm phiên khi phát hiện tái sử dụng token; comment có `(taskId,userId,deletedAt,createdAt)`.
- Completion có `(userId,completedAt)`, `(projectId,userId,completedAt)` và `(taskId,userId,completedAt)` phục vụ chart theo thời gian, project và lịch sử task; thêm partial index chỉ trên event còn hiệu lực (SQL bên dưới).
- `AuditLog` có `(actorId,createdAt)`, `(targetType,targetId)` và `(createdAt)`.
- Tên label không trùng (không phân biệt hoa thường) trong cùng user, chỉ xét label chưa xóa: partial unique index theo `lower(name)`. Xóa mềm một label giải phóng tên đó để tạo lại.

Prisma schema không biểu diễn partial index, expression index và `CHECK` constraint; thêm chúng bằng migration SQL (đã chạy thử trên PostgreSQL 16 với bảng mô phỏng):

```sql
-- Mỗi user chỉ có một Inbox còn hoạt động
CREATE UNIQUE INDEX "Project_one_inbox_per_user"
  ON "Project" ("userId")
  WHERE "isInbox" = true AND "deletedAt" IS NULL;

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_priority_range"
  CHECK ("priority" BETWEEN 1 AND 4);

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_parent_not_self"
  CHECK ("parentTaskId" IS NULL OR "parentTaskId" <> "id");

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_completed_at_matches_status"
  CHECK (
    ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL)
    OR ("status" <> 'COMPLETED' AND "completedAt" IS NULL)
  );

-- Giờ đến hạn chỉ có nghĩa khi có ngày đến hạn
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_due_time_requires_date"
  CHECK ("dueTime" IS NULL OR "dueDate" IS NOT NULL);

-- Email luôn chữ thường
ALTER TABLE "User"
  ADD CONSTRAINT "User_email_lowercase"
  CHECK ("email" = lower("email"));

-- Tên label không trùng (không phân biệt hoa thường), chỉ xét label chưa xóa
CREATE UNIQUE INDEX "Label_userId_lower_name_key"
  ON "Label" ("userId", lower("name"))
  WHERE "deletedAt" IS NULL;

-- Thống kê chỉ đọc các lần hoàn thành còn hiệu lực
CREATE INDEX "TaskCompletion_active_userId_completedAt_idx"
  ON "TaskCompletion" ("userId", "completedAt")
  WHERE "revertedAt" IS NULL;
```

Partial unique index chỉ áp dụng cho bản ghi còn hoạt động; check constraint tránh dữ liệu priority/trạng thái/giờ đến hạn không hợp lệ. Những index và constraint này phải được giữ trong migration khi thay đổi schema. Khi tạo migration bằng `prisma migrate dev --create-only`, dán SQL trên vào file migration trước khi áp dụng.

## 6. Quyền sở hữu dữ liệu

1. Sau authentication, backend lấy `userId` từ session/JWT đã xác thực; không tin `userId` do client gửi.
2. Mọi truy vấn user thường lọc `userId` (và `deletedAt: null` khi đọc dữ liệu hoạt động), ví dụ `task.findMany({ where: { userId, deletedAt: null } })`.
3. Với truy vấn theo `id`, dùng điều kiện kép `{ id, userId }`; không tìm theo ID trước rồi chỉ kiểm tra ở UI.
4. FK ghép `Task(projectId,userId)`, `Task(sectionId,projectId)`, `Task(parentTaskId,projectId)`, `TaskLabel(taskId/labelId,userId)`, `Comment(taskId,userId)` và `TaskCompletion(taskId/projectId,userId)` cản cross-owner reference ngay database. Backend vẫn phải chặn chu trình sub-task.
5. Middleware/guard chỉ cho phép `role=ADMIN` vào route quản trị. Admin có thể xem/khóa tài khoản và xử lý moderation; quyền này không đồng nghĩa được truy cập dữ liệu cá nhân qua API người dùng thông thường. Mọi thao tác quản trị (khóa/mở tài khoản, đổi role, xóa dữ liệu) phải ghi một dòng `AuditLog` trong cùng transaction với thao tác đó.
6. Truy vấn tổng hợp cũng luôn giới hạn `userId`; route admin có thể dùng truy vấn toàn hệ thống riêng, phân trang và ghi log.

## 7. Aggregation query mẫu

Quy ước: trong SQL, `$1`, `$2`... là tham số theo thứ tự, ghi vậy cho dễ đọc. Với Prisma, dùng `prisma.$queryRaw` dạng tagged template và thay mỗi tham số bằng `${giaTri}`; Prisma tự bind tham số, không nối chuỗi SQL. (`$queryRawUnsafe` mới dùng `$1`, và cũng chỉ với tham số bind, không bao giờ nối chuỗi từ input người dùng.) Các tham số có cast tường minh (`::uuid`, `::timestamptz`) vì Prisma gửi chuỗi/ngày dưới dạng text, thiếu cast PostgreSQL có thể báo lỗi `operator does not exist: uuid = text`.

Các bucket ngày/tuần dùng múi giờ của user (`$2` = `User.timezone`, lấy bằng `user.findUnique({ where: { id: userId }, select: { timezone: true } })`). Mọi số liệu hoàn thành chỉ đếm event còn hiệu lực (`revertedAt IS NULL`). Cả 5 truy vấn dưới đây đã chạy thử trên PostgreSQL 16 với dữ liệu mẫu (gồm task cả ngày, task đến hạn 00:00 hôm nay và event đã hoàn tác).

### 7.1 Số task hoàn thành theo ngày

```sql
SELECT
  (date_trunc('day', c."completedAt" AT TIME ZONE $2))::date AS "day",
  count(*)::int AS "completedCount"
FROM "TaskCompletion" c
WHERE c."userId" = $1::uuid
  AND c."revertedAt" IS NULL
  AND c."completedAt" >= $3::timestamptz
  AND c."completedAt" < $4::timestamptz
GROUP BY 1
ORDER BY 1;
```

Ví dụ gọi từ Prisma (gợi ý):

```ts
const rows = await prisma.$queryRaw<{ day: Date; completedCount: number }[]>`
  SELECT (date_trunc('day', c."completedAt" AT TIME ZONE ${timezone}))::date AS "day",
         count(*)::int AS "completedCount"
  FROM "TaskCompletion" c
  WHERE c."userId" = ${userId}::uuid
    AND c."revertedAt" IS NULL
    AND c."completedAt" >= ${from}::timestamptz
    AND c."completedAt" < ${to}::timestamptz
  GROUP BY 1
  ORDER BY 1`;
```

### 7.2 Số lần hoàn thành theo project trong khoảng thời gian

```sql
SELECT p."id", p."name", count(c."id")::int AS "completedCount"
FROM "Project" p
LEFT JOIN "TaskCompletion" c
  ON c."projectId" = p."id"
 AND c."userId" = p."userId"
 AND c."revertedAt" IS NULL
 AND c."completedAt" >= $2::timestamptz
 AND c."completedAt" < $3::timestamptz
WHERE p."userId" = $1::uuid
  AND p."deletedAt" IS NULL
GROUP BY p."id", p."name"
ORDER BY "completedCount" DESC, p."name";
```

Prisma gợi ý: `$queryRaw` để giữ project không có completion nhờ `LEFT JOIN`. Thống kê đơn giản không cần join có thể dùng `taskCompletion.groupBy({ by: ["projectId"], where: { userId, revertedAt: null, completedAt: { gte, lt } }, _count: { _all: true } })`.

### 7.3 Task quá hạn chưa hoàn thành, nhóm theo project

```sql
WITH now_local AS (SELECT now() AT TIME ZONE $2 AS ts)
SELECT p."id", p."name", count(t."id")::int AS "overdueCount"
FROM "Task" t
JOIN "Project" p ON p."id" = t."projectId" AND p."userId" = t."userId"
CROSS JOIN now_local n
WHERE t."userId" = $1::uuid
  AND t."deletedAt" IS NULL
  AND p."deletedAt" IS NULL
  AND t."status" <> 'COMPLETED'
  AND t."dueDate" IS NOT NULL
  AND (
    t."dueDate" < n.ts::date
    OR (t."dueDate" = n.ts::date AND t."dueTime" IS NOT NULL AND t."dueTime" < n.ts::time)
  )
GROUP BY p."id", p."name"
ORDER BY "overdueCount" DESC;
```

Task cả ngày (`dueTime IS NULL`) chỉ quá hạn từ ngày hôm sau; task có giờ quá hạn khi giờ hiện tại theo múi giờ user vượt `dueTime`. Prisma gợi ý: `$queryRaw`. Nếu chỉ cần đếm theo ngày (bỏ qua giờ), dùng `task.groupBy({ by: ["projectId"], where: { userId, deletedAt: null, status: { not: "COMPLETED" }, dueDate: { lt: todayInUserTimezone } }, _count: { _all: true } })`, trong đó `todayInUserTimezone` là ngày hiện tại theo múi giờ user; map `projectId` sang tên project bằng truy vấn project cũng lọc `userId`.

### 7.4 Năng suất theo tuần (tuần bắt đầu thứ Hai)

```sql
SELECT
  date_trunc('week', c."completedAt" AT TIME ZONE $2)::date AS "weekStart",
  count(*)::int AS "completedCount"
FROM "TaskCompletion" c
WHERE c."userId" = $1::uuid
  AND c."revertedAt" IS NULL
  AND c."completedAt" >= $3::timestamptz
  AND c."completedAt" < $4::timestamptz
GROUP BY 1
ORDER BY 1;
```

PostgreSQL `date_trunc('week', ...)` tính tuần từ thứ Hai. Prisma gợi ý giống thống kê ngày: `$queryRaw` có tham số; nếu chỉ cần tổng theo trạng thái hiện tại thì dùng `task.groupBy({ by: ["status"], where: { userId, deletedAt: null }, _count: { _all: true } })`.

### 7.5 View Today: task đến hạn hôm nay và quá hạn

```sql
WITH now_local AS (SELECT now() AT TIME ZONE $2 AS ts)
SELECT t."id", t."title", t."dueDate", t."dueTime", t."priority"
FROM "Task" t
CROSS JOIN now_local n
WHERE t."userId" = $1::uuid
  AND t."deletedAt" IS NULL
  AND t."status" <> 'COMPLETED'
  AND t."dueDate" <= n.ts::date
ORDER BY t."dueDate", t."dueTime" NULLS LAST, t."priority", t."position";
```

Prisma gợi ý: `task.findMany({ where: { userId, deletedAt: null, status: { not: "COMPLETED" }, dueDate: { lte: todayInUserTimezone } }, orderBy: [{ dueDate: "asc" }, { dueTime: { sort: "asc", nulls: "last" } }, { priority: "asc" }, { position: "asc" }] })`. Dùng `$queryRaw` khi cần so sánh cả giờ với thời điểm hiện tại.

## 8. Quản lý trạng thái task

Các quy tắc dưới đây do backend thực hiện; mỗi thao tác gồm nhiều bước chạy trong MỘT transaction.

- **Tạo:** tạo task với `userId`, project (và section nếu có) đã kiểm tra quyền, `status=TODO`, `position` ở cuối danh sách (`max(position) + 1024`). `sectionId` có thể NULL.
- **Bắt đầu:** `TODO → IN_PROGRESS`; `completedAt` giữ NULL.
- **Hoàn thành (task không lặp):** cập nhật `status=COMPLETED`, `completedAt=now()` và thêm một `TaskCompletion` chứa `userId`, `projectId`, `completedAt`, `dueDateSnapshot`, `dueTimeSnapshot`. Nếu task có sub-task chưa xong, hoàn thành luôn chúng trong cùng transaction, mỗi task một event.
- **Hoàn thành (task lặp):** ghi event như trên, tính `dueDate`/`dueTime` kế tiếp từ RRULE theo `User.timezone` và chính sách "tính từ ngày đến hạn" hoặc "tính từ ngày hoàn thành" đã chọn trong ứng dụng, rồi giữ `status=TODO` với hạn mới. Task lặp không bao giờ ở trạng thái COMPLETED, nên mỗi lần hoàn thành là một event độc lập. Parser RRULE và xử lý DST thuộc tầng ứng dụng.
- **Mở lại (task không lặp):** `COMPLETED → TODO` (hoặc `IN_PROGRESS`), đặt `completedAt=NULL`, và đặt `revertedAt=now()` cho event hoàn thành mới nhất chưa bị hoàn tác của task. Không xóa event, nên thống kê không đếm trùng khi task được hoàn thành lại.
- **Xóa:** xóa mềm cả cây con của task trong một câu lệnh (bên dưới). Xóa mềm section kéo theo xóa mềm các task thuộc section (và cây con của chúng); xóa mềm project kéo theo section và task của project. Khôi phục là thao tác ngược lại (đặt `deletedAt = NULL` cho cùng tập bản ghi). Hard delete chỉ qua chính sách retention.
- **Chuyển project/section:** chuyển cả cây con trong MỘT câu `UPDATE` (bên dưới) vì FK sub-task kiểm tra cuối câu lệnh; chuyển riêng một sub-task sang project khác sẽ bị database từ chối. `sectionId` đích phải thuộc project đích hoặc là NULL.
- **Kéo thả:** sắp xếp bằng `position integer`, cấp các giá trị cách nhau `1024`. Khi chèn giữa hai task, chọn giá trị giữa (`floor((a+b)/2)`); khi hai giá trị liền kề chênh nhau dưới 2, renumber lại các task trong danh sách đó theo bước `1024` bằng một transaction. Kiểm tra task cùng owner/section để hạn chế race condition.
- **Sub-task:** `parentTaskId` tạo cây. Database đảm bảo cha tồn tại, cùng project và không tự làm cha của chính nó. Backend cần giới hạn độ sâu (đề xuất tối đa 3 cấp, cấu hình được) và chặn chu trình bằng cách đi ngược chuỗi cha của task đích trước khi gán.

Xóa mềm cả cây con:

```sql
-- Xóa mềm cả cây con của một task
WITH RECURSIVE subtree AS (
  SELECT "id" FROM "Task" WHERE "id" = $1::uuid AND "userId" = $2::uuid
  UNION ALL
  SELECT c."id" FROM "Task" c JOIN subtree s ON c."parentTaskId" = s."id"
)
UPDATE "Task"
SET "deletedAt" = now(), "updatedAt" = now()
WHERE "id" IN (SELECT "id" FROM subtree) AND "deletedAt" IS NULL;
```

Chuyển cả cây con sang project/section khác:

```sql
-- Chuyển cả cây con sang project/section khác: PHẢI là MỘT câu lệnh
WITH RECURSIVE subtree AS (
  SELECT "id" FROM "Task" WHERE "id" = $1::uuid AND "userId" = $2::uuid
  UNION ALL
  SELECT c."id" FROM "Task" c JOIN subtree s ON c."parentTaskId" = s."id"
)
UPDATE "Task"
SET "projectId" = $3::uuid, "sectionId" = $4::uuid, "updatedAt" = now()
WHERE "id" IN (SELECT "id" FROM subtree);
```

Cả hai câu lệnh trên dùng SQL thô nên không kích hoạt `@updatedAt` của Prisma; vì vậy chúng tự đặt `updatedAt = now()`. Cả hai đã chạy thử trên PostgreSQL 16 với cây sub-task nhiều cấp.

## 9. Bảo mật

- Không lưu mật khẩu rõ; dùng Argon2id (hoặc thuật toán hash mật khẩu được cấu hình an toàn) và salt riêng theo chuẩn thư viện.
- Token xác thực email, reset mật khẩu, refresh token được sinh ngẫu nhiên đủ mạnh; chỉ lưu SHA-256 hash ở dạng hex, gửi raw token đúng một lần.
- Chấp nhận token khi hash khớp, `expiresAt > now()` và `consumedAt IS NULL`; đánh dấu `consumedAt` trong cùng transaction với thao tác xác nhận/đổi mật khẩu. Phát hành token mới cần vô hiệu các token chưa dùng trước đó theo chính sách.
- Refresh token rotate sau khi dùng: tạo `Session` mới cùng `familyId`, revoke phiên cũ. Nếu một refresh token đã bị revoke/rotate mà vẫn được gửi lại, coi như token bị lộ và revoke toàn bộ phiên cùng `familyId`. Logout revoke session hiện tại; đổi mật khẩu revoke tất cả session đang hoạt động của user.
- Người dùng `LOCKED` hoặc `deletedAt IS NOT NULL` không được tạo phiên mới; kiểm tra trạng thái tài khoản trong auth middleware.
- Không log mật khẩu, raw token, refresh token hoặc nội dung nhạy cảm. Luôn dùng parameterized query.
- Endpoint đăng ký và quên mật khẩu trả về thông báo chung, không cho biết email có tồn tại hay không; giới hạn tần suất (rate limit) cho đăng nhập, gửi lại email xác thực và quên mật khẩu.
- Mọi thao tác quản trị ghi `AuditLog` (mục 6); không lưu mật khẩu hay token trong `metadata`.

## 10. Production-ready và vận hành

- **Soft delete:** dùng `deletedAt` cho user/project/section/task/label/comment; mặc định API không đọc bản ghi đã xóa. Xóa mềm lan xuống cây con, section và project do backend thực hiện trong transaction (mục 8). Không hard delete user trong luồng thông thường vì FK cascade sẽ xóa dữ liệu. Khi xóa mềm user: ghi đè email bằng giá trị ẩn danh (ví dụ `deleted-<id>@deleted.invalid`), thu hồi mọi session.
- **Thời gian:** các mốc sự kiện (`createdAt`, `completedAt`...) là `timestamptz` lưu instant UTC. Ngày/giờ đến hạn (`dueDate`, `dueTime`) là giờ địa phương theo `User.timezone` (tên IANA, ví dụ `Asia/Ho_Chi_Minh`), tính DST ở tầng ứng dụng khi lặp lịch.
- **ID:** UUID v7 (`@default(uuid(7))`) vừa không lộ thứ tự tạo dạng số tăng dần vừa sắp xếp được theo thời gian, nên index B-tree gọn hơn UUID v4. Prisma tạo ID phía Prisma Client; nếu ghi bằng SQL thô ngoài Prisma (ví dụ script seed bằng SQL) phải tự sinh ID.
- **Migration:** mọi thay đổi schema qua `prisma migrate dev` ở môi trường phát triển và migration đã review ở production (`prisma migrate deploy`); không dùng `db push` cho production. Các CHECK/partial index thủ công (mục 5) phải nằm trong migration có version control.
- **Prisma 7:** URL kết nối không nằm trong `schema.prisma` mà trong `prisma.config.ts`. Prisma 7 không tự đọc file `.env` cho config, nên đầu `prisma.config.ts` phải có `import "dotenv/config"` (cài `dotenv`); thiếu dòng này, lệnh Prisma báo `Cannot resolve environment variable: DATABASE_URL` dù `.env` có sẵn. Generator `prisma-client` cần `output` tường minh. Với PostgreSQL, Prisma Client 7 cần driver adapter `@prisma/adapter-pg` khi khởi tạo Client. Lệnh seed khai báo ở `migrations.seed` trong `prisma.config.ts`.
- **Seed:** tạo 1 admin và vài user mẫu qua seed script; tạo Inbox cho mỗi user (không cần section), thêm project/section/task/label mẫu. Không commit mật khẩu mặc định; lấy secret từ environment, hoặc tạo mật khẩu ngẫu nhiên và buộc đổi sau lần đăng nhập đầu.
- **Nhật ký quản trị:** `AuditLog` là append-only; xem xét retention (ví dụ giữ 12 tháng) và index theo thời gian để dọn dẹp.
- **Mở rộng:** phân trang cursor cho task/comment; giữ completion event gần như bất biến (chỉ đổi `revertedAt`). Khi dữ liệu lớn, cân nhắc partition `TaskCompletion` theo thời gian, retention/archival, read replica hoặc bảng tổng hợp được refresh. Chưa lưu counter tổng trên `Project` vì có nguy cơ lệch dữ liệu; aggregation trực tiếp phù hợp quy mô bài tập. Nếu cần kéo thả mà không bao giờ phải renumber, đổi `position` sang fractional indexing (chuỗi).
- **Chuẩn hóa:** `TaskLabel` tách quan hệ N-M; token/session/comment/completion là thực thể riêng. `Task.userId` lặp lại thông tin có thể suy ra từ project để thực hiện scope và composite FK; `TaskCompletion.projectId` là snapshot lịch sử. Đây là hai ngoại lệ hiệu năng/toàn vẹn có chủ đích, không lưu số liệu đếm dẫn xuất.

## 11. Prisma schema (Prisma ORM 7)

Schema giả định được lưu tại `todolist-api/prisma/schema.prisma`; đường dẫn `output` tính tương đối từ file schema. Prisma 7 cấu hình `DATABASE_URL` trong `prisma.config.ts` (cài thêm `dotenv`, và một runner như `tsx` nếu dùng seed bằng TypeScript):

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

Schema dưới đây đã được kiểm tra bằng bộ validator của Prisma và là nền tảng copy được; áp dụng thêm các CHECK và partial/expression index trong mục 5 bằng migration SQL.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum Role {
  USER
  ADMIN
}

enum AccountStatus {
  ACTIVE
  LOCKED
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  COMPLETED
}

model User {
  id                      String                   @id @default(uuid(7)) @db.Uuid
  email                   String                   @unique @db.VarChar(320)
  passwordHash            String                   @db.VarChar(255)
  displayName             String                   @db.VarChar(120)
  role                    Role                     @default(USER)
  accountStatus           AccountStatus            @default(ACTIVE)
  emailVerifiedAt         DateTime?                @db.Timestamptz(3)
  timezone                String                   @default("UTC") @db.VarChar(64)
  createdAt               DateTime                 @default(now()) @db.Timestamptz(3)
  updatedAt               DateTime                 @updatedAt @db.Timestamptz(3)
  deletedAt               DateTime?                @db.Timestamptz(3)
  projects                Project[]
  tasks                   Task[]
  labels                  Label[]
  emailVerificationTokens EmailVerificationToken[]
  passwordResetTokens     PasswordResetToken[]
  sessions                Session[]
  comments                Comment[]                @relation("CommentAuthor")
  taskCompletions         TaskCompletion[]
  auditLogs               AuditLog[]               @relation("AuditActor")
}

model EmailVerificationToken {
  id         String    @id @default(uuid(7)) @db.Uuid
  userId     String    @db.Uuid
  tokenHash  String    @unique @db.Char(64)
  expiresAt  DateTime  @db.Timestamptz(3)
  consumedAt DateTime? @db.Timestamptz(3)
  createdAt  DateTime  @default(now()) @db.Timestamptz(3)
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, expiresAt])
}

model PasswordResetToken {
  id         String    @id @default(uuid(7)) @db.Uuid
  userId     String    @db.Uuid
  tokenHash  String    @unique @db.Char(64)
  expiresAt  DateTime  @db.Timestamptz(3)
  consumedAt DateTime? @db.Timestamptz(3)
  createdAt  DateTime  @default(now()) @db.Timestamptz(3)
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, expiresAt])
}

model Session {
  id               String    @id @default(uuid(7)) @db.Uuid
  userId           String    @db.Uuid
  familyId         String    @db.Uuid
  refreshTokenHash String    @unique @db.Char(64)
  userAgent        String?   @db.VarChar(512)
  ipAddress        String?   @db.VarChar(45)
  expiresAt        DateTime  @db.Timestamptz(3)
  revokedAt        DateTime? @db.Timestamptz(3)
  lastUsedAt       DateTime? @db.Timestamptz(3)
  createdAt        DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime  @updatedAt @db.Timestamptz(3)
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, revokedAt])
  @@index([familyId])
  @@index([expiresAt])
}

model Project {
  id          String           @id @default(uuid(7)) @db.Uuid
  userId      String           @db.Uuid
  name        String           @db.VarChar(120)
  color       String?          @db.VarChar(32)
  isInbox     Boolean          @default(false)
  position    Int              @default(1024)
  createdAt   DateTime         @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime         @updatedAt @db.Timestamptz(3)
  deletedAt   DateTime?        @db.Timestamptz(3)
  user        User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  sections    Section[]
  tasks       Task[]
  completions TaskCompletion[]

  @@unique([id, userId])
  @@index([userId, deletedAt, position])
}

model Section {
  id        String    @id @default(uuid(7)) @db.Uuid
  projectId String    @db.Uuid
  name      String    @db.VarChar(120)
  position  Int       @default(1024)
  createdAt DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt DateTime  @updatedAt @db.Timestamptz(3)
  deletedAt DateTime? @db.Timestamptz(3)
  project   Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tasks     Task[]

  @@unique([id, projectId])
  @@index([projectId, deletedAt, position])
}

model Task {
  id             String           @id @default(uuid(7)) @db.Uuid
  userId         String           @db.Uuid
  projectId      String           @db.Uuid
  sectionId      String?          @db.Uuid
  parentTaskId   String?          @db.Uuid
  title          String           @db.VarChar(500)
  description    String?          @db.Text
  status         TaskStatus       @default(TODO)
  priority       Int              @default(4) @db.SmallInt
  dueDate        DateTime?        @db.Date
  dueTime        DateTime?        @db.Time(0)
  recurrenceRule String?          @db.Text
  position       Int              @default(1024)
  completedAt    DateTime?        @db.Timestamptz(3)
  createdAt      DateTime         @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime         @updatedAt @db.Timestamptz(3)
  deletedAt      DateTime?        @db.Timestamptz(3)
  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  project        Project          @relation(fields: [projectId, userId], references: [id, userId], onDelete: Cascade)
  section        Section?         @relation(fields: [sectionId, projectId], references: [id, projectId], onDelete: Restrict)
  parentTask     Task?            @relation("TaskSubtasks", fields: [parentTaskId, projectId], references: [id, projectId], onDelete: NoAction, onUpdate: NoAction)
  subtasks       Task[]           @relation("TaskSubtasks")
  taskLabels     TaskLabel[]
  comments       Comment[]
  completions    TaskCompletion[]

  @@unique([id, userId])
  @@unique([id, projectId])
  @@index([userId, status, deletedAt])
  @@index([userId, dueDate, deletedAt])
  @@index([projectId, userId, deletedAt, position])
  @@index([sectionId, projectId, deletedAt, position])
  @@index([parentTaskId, projectId])
}

model Label {
  id         String      @id @default(uuid(7)) @db.Uuid
  userId     String      @db.Uuid
  name       String      @db.VarChar(80)
  color      String?     @db.VarChar(32)
  createdAt  DateTime    @default(now()) @db.Timestamptz(3)
  updatedAt  DateTime    @updatedAt @db.Timestamptz(3)
  deletedAt  DateTime?   @db.Timestamptz(3)
  user       User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  taskLabels TaskLabel[]

  @@unique([id, userId])
  @@index([userId, deletedAt])
}

model TaskLabel {
  taskId    String   @db.Uuid
  labelId   String   @db.Uuid
  userId    String   @db.Uuid
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  task      Task     @relation(fields: [taskId, userId], references: [id, userId], onDelete: Cascade)
  label     Label    @relation(fields: [labelId, userId], references: [id, userId], onDelete: Cascade)

  @@id([taskId, labelId])
  @@index([taskId, userId])
  @@index([labelId, userId])
}

model Comment {
  id        String    @id @default(uuid(7)) @db.Uuid
  taskId    String    @db.Uuid
  userId    String    @db.Uuid
  content   String    @db.Text
  createdAt DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt DateTime  @updatedAt @db.Timestamptz(3)
  deletedAt DateTime? @db.Timestamptz(3)
  task      Task      @relation(fields: [taskId, userId], references: [id, userId], onDelete: Cascade)
  author    User      @relation("CommentAuthor", fields: [userId], references: [id], onDelete: Cascade)

  @@index([taskId, userId, deletedAt, createdAt])
  @@index([userId, createdAt])
}

model TaskCompletion {
  id              String    @id @default(uuid(7)) @db.Uuid
  taskId          String    @db.Uuid
  userId          String    @db.Uuid
  projectId       String    @db.Uuid
  completedAt     DateTime  @default(now()) @db.Timestamptz(3)
  revertedAt      DateTime? @db.Timestamptz(3)
  dueDateSnapshot DateTime? @db.Date
  dueTimeSnapshot DateTime? @db.Time(0)
  task            Task      @relation(fields: [taskId, userId], references: [id, userId], onDelete: Cascade)
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  project         Project   @relation(fields: [projectId, userId], references: [id, userId], onDelete: Cascade)

  @@index([userId, completedAt])
  @@index([projectId, userId, completedAt])
  @@index([taskId, userId, completedAt])
}

model AuditLog {
  id         String   @id @default(uuid(7)) @db.Uuid
  actorId    String?  @db.Uuid
  action     String   @db.VarChar(64)
  targetType String   @db.VarChar(32)
  targetId   String?  @db.Uuid
  metadata   Json?
  ipAddress  String?  @db.VarChar(45)
  createdAt  DateTime @default(now()) @db.Timestamptz(3)
  actor      User?    @relation("AuditActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([actorId, createdAt])
  @@index([targetType, targetId])
  @@index([createdAt])
}
```

### Tự rà soát trước khi dùng

- Mỗi model có PK; `TaskLabel` dùng PK ghép `(taskId,labelId)`.
- Mọi FK có index phù hợp: index đơn/composite ở model sở hữu FK; quan hệ ghép có index bắt đầu bằng các cột FK.
- Mọi chức năng đã chọn có bảng/trường phục vụ; quan hệ N-M là `TaskLabel`, self-relation là `Task.parentTaskId`, trạng thái/lặp/sắp xếp/ngày đến hạn nằm trên `Task`, thao tác quản trị nằm ở `AuditLog`.
- Các quan hệ ghép giữ `Task` trong project đúng user, section (nếu có) đúng project, sub-task cùng project với cha, comment/completion đúng task owner và label đúng owner.
- CHECK constraints, partial unique Inbox, unique label theo `lower(name)`, partial index completion phải được triển khai bằng migration SQL như mục 5; Prisma schema riêng không tự tạo chúng.
- Mọi truy vấn thống kê lọc `revertedAt IS NULL` khi đếm lần hoàn thành.

## 12. Thay đổi so với phiên bản trước

| #   | Thay đổi                                                                                                           | Lý do                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1   | `dueAt`/`dueTimezone` → `dueDate` + `dueTime` (NULL = cả ngày); snapshot trong `TaskCompletion` tách tương ứng     | Phân biệt task cả ngày với task có giờ; tránh tính quá hạn từ 00:00; bỏ phụ thuộc `dueTimezone` riêng |
| 2   | FK sub-task thành khóa ghép `(parentTaskId, projectId)` với `NO ACTION`; xóa mềm và chuyển project theo cả cây con | Sub-task luôn cùng project; không để sub-task mồ côi                                                  |
| 3   | `TaskCompletion.revertedAt`; thống kê lọc `revertedAt IS NULL`                                                     | Không đếm trùng khi mở lại rồi hoàn thành lại                                                         |
| 4   | `position` từ `bigint` sang `integer`                                                                              | Tránh lỗi `JSON.stringify` với BigInt trong Express                                                   |
| 5   | `Task.sectionId` nullable; bỏ section mặc định bắt buộc                                                            | Đơn giản hơn, task không cần section; Inbox không cần section                                         |
| 6   | Thêm `CHECK` email chữ thường; unique label theo `lower(name)` trên label chưa xóa                                 | Tránh trùng do khác hoa thường; tên label được tái sử dụng sau khi xóa                                |
| 7   | `Session` thêm `familyId`, `userAgent`, `ipAddress`                                                                | Phát hiện tái sử dụng refresh token; màn hình thiết bị đăng nhập                                      |
| 8   | Thêm bảng `AuditLog`                                                                                               | Ghi vết thao tác quản trị cho trang admin                                                             |
| 9   | `uuid()` → `uuid(7)`; bỏ `@@index([deletedAt])` trên `User`                                                        | Index gọn hơn; bỏ index ít giá trị                                                                    |
| 10  | Sửa `prisma.config.ts` (thêm `dotenv/config`, `migrations.seed`)                                                   | Thiếu `dotenv/config` làm Prisma 7 không đọc được `DATABASE_URL`                                      |
| 11  | Mục 7: thêm cast `::uuid`/`::timestamptz`, giải thích `$queryRaw`, thêm 7.5 View Today                             | Tránh lỗi kiểu tham số; phục vụ trang Today của UI                                                    |
| 12  | Thêm CHECK `Task_due_time_requires_date` và partial index completion                                               | Toàn vẹn dữ liệu và hiệu năng thống kê                                                                |
