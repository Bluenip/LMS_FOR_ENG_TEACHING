import type { Locale } from "./config";

const EXACT_EN_MESSAGES: Record<string, string> = {
  // Auth & permissions
  "Vui lòng đăng nhập để tiếp tục.": "Please sign in to continue.",
  "Tài khoản không tồn tại.": "Account does not exist.",
  "Tài khoản của bạn đã bị khoá.": "Your account has been locked.",
  "Bạn không có quyền truy cập chức năng này.": "You do not have permission to access this feature.",
  "Không tìm thấy lớp học.": "Class not found.",
  "Bạn không có quyền quản lý lớp học này.": "You do not have permission to manage this class.",
  "Bạn chưa tham gia lớp học này.": "You are not enrolled in this class.",
  "Bạn không có quyền truy cập lớp học này.": "You do not have permission to access this class.",
  "Bạn không có quyền xem thông tin học sinh này.": "You do not have permission to view this student's information.",
  "Không tìm thấy phiếu bài tập.": "Worksheet not found.",
  "Bạn không có quyền chỉnh sửa phiếu bài tập này.": "You do not have permission to edit this worksheet.",
  "Không tìm thấy bài tập.": "Assignment not found.",
  "Bạn không có quyền quản lý bài tập này.": "You do not have permission to manage this assignment.",
  "Bạn không thuộc lớp được giao bài tập này.": "You are not enrolled in the class for this assignment.",
  "Bạn không nằm trong danh sách học sinh được giao bài tập này.":
    "You are not included in the target students for this assignment.",
  "Chỉ chọn được nhóm học sinh cụ thể khi giao cho 1 lớp duy nhất.":
    "Specific target students can only be selected when assigning to a single class.",
  "Học sinh không thuộc lớp học của bài tập này hoặc tài khoản đang bị xoá.":
    "Student is not active in this assignment's class.",
  "Không tìm thấy ngoại lệ cho học sinh này.": "No override found for this student.",
  "Không tìm thấy câu nhận xét mẫu.": "Comment preset not found.",
  "Bạn không có quyền xoá câu nhận xét mẫu này.":
    "You do not have permission to delete this comment preset.",
  "Không tìm thấy câu hỏi trong bài tập này.": "Question not found in this assignment.",
  "Nội dung nhận xét mẫu không được để trống": "Preset comment content cannot be empty.",
  "Tên tiêu chí rubric không được để trống": "Rubric criterion title cannot be empty.",
  "Số lượng câu nhận xét mẫu đã đạt tối đa (100).":
    "Maximum number of comment presets reached (100).",
  "Bạn không có quyền truy cập bài làm này.": "You do not have permission to access this submission.",
  "Chỉ giáo viên mới được xem trang chấm bài chi tiết.": "Only teachers can view detailed grading.",
  "Chỉ giáo viên mới có quyền chấm điểm.": "Only teachers can grade submissions.",
  "Chỉ giáo viên mới có quyền trả bài làm lại.":
    "Only teachers can return submissions for revision.",
  "Vui lòng chọn file để tải lên.": "Please select a file to upload.",
  "Bạn không sở hữu phiếu bài tập này.": "You do not own this worksheet.",
  "Phiếu bài tập này chưa được giáo viên chia sẻ.": "This worksheet has not been shared by its author.",
  "Một hoặc nhiều lớp học không hợp lệ hoặc không thuộc quyền quản lý của bạn.":
    "One or more classes are invalid or not managed by you.",
  "Dữ liệu đầu vào không hợp lệ.": "Invalid input data.",
  "TOTP_ENCRYPTION_KEY phải dài ít nhất 32 ký tự.": "TOTP_ENCRYPTION_KEY must be at least 32 characters long.",
  "Đã có lỗi máy chủ. Vui lòng thử lại sau.": "Server error. Please try again later.",

  // Files & uploads
  "Đường dẫn tệp không hợp lệ.": "Invalid file path.",
  "Bạn không có quyền tải tệp này.": "You do not have permission to download this file.",
  "Không tìm thấy tệp.": "File not found.",
  "Vui lòng chọn file Excel (.xlsx).": "Please select an Excel (.xlsx) file.",
  "File Excel không được vượt quá 5MB.": "Excel file must not exceed 5MB.",
  "File Excel không có trang tính nào.": "The Excel file has no worksheets.",
  "Không tìm thấy dữ liệu học sinh hợp lệ trong file Excel.":
    "No valid student rows found in the Excel file.",
  "Vui lòng tải file lên hoặc nhập đường dẫn URL.": "Please upload a file or enter a URL.",
  "Vui lòng chọn file âm thanh để tải lên.": "Please select an audio file to upload.",
  "Vui lòng chọn file PDF để tải lên.": "Please select a PDF file to upload.",
  "Vui lòng chọn file backup (.zip / .json) hoặc file Word (.docx).":
    "Please select a backup (.zip / .json) or Word (.docx) file.",
  "Vui lòng chọn file Word (.docx) hoặc .txt.": "Please select a Word (.docx) or .txt file.",
  "Vui lòng nhập nội dung câu hỏi.": "Please enter question content.",
  "File PDF trống.": "The PDF file is empty.",
  "File PDF không có trang nào.": "The PDF file has no pages.",
  "Chỉ chấp nhận định dạng file PDF (application/pdf).":
    "Only PDF files (application/pdf) are accepted.",
  "File không phải là PDF hợp lệ (sai magic bytes %PDF).":
    "Invalid PDF file (missing %PDF header).",
  "Kích thước file không hợp lệ hoặc vượt quá giới hạn.":
    "Invalid file size or size limit exceeded.",
  "Định dạng file không được hỗ trợ (chỉ nhận PDF, MP4, WebM, MP3, WAV, OGG, M4A).":
    "Unsupported file format (only PDF, MP4, WebM, MP3, WAV, OGG, M4A are supported).",
  "Định dạng file nghe không được hỗ trợ (chỉ nhận MP3, WAV, OGG, M4A, WebM).":
    "Unsupported audio format (only MP3, WAV, OGG, M4A, WebM are supported).",
  "File nghe bị rỗng.": "The audio file is empty.",
  "Không tìm thấy file nghe.": "Audio file not found.",
  "Không tìm thấy file nghe trong bài tập này.": "Audio file not found in this assignment.",
  "Thiếu mã xác thực phát âm thanh.": "Missing audio playback token.",
  "Mã phát âm thanh không hợp lệ hoặc đã hết hạn.": "Audio playback token is invalid or expired.",
  "Không có quyền truy cập file nghe.": "You do not have permission to access this audio file.",
  "Không tìm thấy dữ liệu file nghe.": "Audio file data not found.",
  "Vui lòng chọn file ảnh hợp lệ (PNG, JPG hoặc WebP).":
    "Please select a valid image file (PNG, JPG, or WebP).",
  "Ảnh vượt quá dung lượng tối đa cho phép.": "Image exceeds the maximum allowed size.",
  "Vui lòng chọn từ 1 đến 30 ảnh trang đề.": "Please select between 1 and 30 page images.",
  "Không thể thay ảnh nền vì đã có học sinh làm bài trên worksheet này.":
    "Cannot replace background images because students have already submitted work on this worksheet.",
  "Câu hỏi này không phải dạng nộp ảnh bài làm.":
    "This question does not accept uploaded photo answers.",
  "Câu hỏi này không hỗ trợ tải file bài làm.":
    "This question does not support file uploads.",
  "Chỉ hỗ trợ ảnh PNG từ khung vẽ.":
    "Only PNG canvas drawings are supported.",
  "Chỉ hỗ trợ file ghi âm (WebM, OGG, MP4/M4A hoặc WAV).":
    "Only audio recordings (WebM, OGG, MP4/M4A, or WAV) are supported.",
  "Chỉ hỗ trợ ảnh (JPEG, PNG, WebP) hoặc file PDF hợp lệ.":
    "Only valid images (JPEG, PNG, WebP) or PDF files are supported.",
  "File được chú thích không thuộc bài làm của học sinh.":
    "Annotated file does not belong to the student's submission.",

  // Worksheet transfer & Word import
  "Không thể thay file PDF vì đã có học sinh làm bài trên worksheet này (vị trí các ô sẽ bị lệch).":
    "Cannot replace PDF because students have already submitted work on this worksheet.",
  "Không thể đọc file Word (.docx). Hãy kiểm tra định dạng file không bị hỏng hoặc mật khẩu.":
    "Could not read the Word (.docx) file. Make sure it is not corrupted or password-protected.",
  "Chỉ hỗ trợ file Word (.docx) hoặc văn bản (.txt).":
    "Only Word (.docx) or plain text (.txt) files are supported.",
  "Bạn chưa có phiếu bài tập nào để sao lưu.": "You have no worksheets to back up yet.",
  "File backup không đúng định dạng Pivora.": "Backup file is not a valid Pivora package.",
  "Không tìm thấy câu điền từ nào có dấu __đáp án__ trong file.":
    "No fill-in-the-blank questions using __answer__ syntax were found in the file.",
  "File JSON không hợp lệ.": "Invalid JSON file.",
  "File ZIP không hợp lệ hoặc bị hỏng.": "Invalid or corrupted ZIP file.",
  "File backup thư viện không đúng định dạng Pivora.":
    "Library backup file is not a valid Pivora package.",
  "Không tìm thấy phiếu bài tập nào trong file backup.":
    "No worksheets were found in the backup file.",
  "File ZIP không phải gói backup Pivora (thiếu manifest.json).":
    "ZIP file is not a Pivora backup package (missing manifest.json).",
  "Định dạng file không được hỗ trợ. Hãy dùng .engclass.zip, .zip, .json, .docx hoặc .txt.":
    "Unsupported file format. Please use .engclass.zip, .zip, .json, .docx, or .txt.",

  // Class, posts, lessons
  "Không thể tạo mã lớp duy nhất, vui lòng thử lại.":
    "Could not generate a unique class join code. Please try again.",
  "Mã lớp không tồn tại hoặc lớp đã đóng.": "Class code does not exist or the class is archived.",
  "Không tìm thấy yêu cầu tham gia.": "Enrollment request not found.",
  "Không tìm thấy học sinh trong lớp.": "Student not found in this class.",
  "Không tìm thấy bài đăng.": "Post not found.",
  "Bạn không có quyền xoá bài đăng này.": "You do not have permission to delete this post.",
  "Không tìm thấy chương bài giảng.": "Lesson chapter not found.",
  "Không tìm thấy tài liệu.": "Material not found.",
  "Bạn cần nộp bài tập trước đó trong Workbook trước khi mở bài này.":
    "You must submit the previous assignment in this workbook before opening this one.",
  "Không tìm thấy workbook.": "Workbook not found.",
  "Bạn không có quyền chỉnh sửa workbook này.": "You do not have permission to edit this workbook.",
  "Workbook chưa có phiếu bài tập nào.": "This workbook has no worksheets yet.",
  "Chỉ trả lại được bài đã nộp hoặc đã chấm điểm.":
    "Only submitted or graded submissions can be returned for revision.",
  "Không thể gỡ chủ sở hữu gốc khỏi danh sách giáo viên lớp.":
    "Cannot remove the original owner from the class teacher list.",
  "Tài khoản này không phải giáo viên hoặc quản trị viên.":
    "This account is not a teacher or administrator.",
  "Chủ sở hữu lớp đã là giáo viên chính rồi.":
    "The class owner is already the primary teacher.",
  "Chỉ chủ sở hữu lớp hoặc quản trị viên mới thực hiện được thao tác này.":
    "Only the class owner or an administrator can perform this action.",
  "Bài đăng này đã khoá bình luận.": "Comments are locked on this post.",
  "Bài đăng này không có bình chọn.": "This post does not have a poll.",
  "Cuộc bình chọn đã đóng.": "This poll is closed.",
  "Bình chọn này chỉ cho phép chọn 1 phương án.":
    "This poll only allows choosing a single option.",
  "Vui lòng chọn ít nhất 1 phương án bình chọn.": "Please select at least 1 poll option.",
  "Lựa chọn bình chọn không hợp lệ.": "Invalid poll option.",
  "Biểu tượng cảm xúc không hợp lệ.": "Invalid reaction emoji.",
  "Chỉ hỗ trợ ảnh (PNG, JPG, WebP), PDF hoặc file Word (.docx).":
    "Only PNG, JPG, WebP images, PDF, or Word (.docx) files are supported.",
  "Tên workbook tối thiểu 2 ký tự": "Workbook title must be at least 2 characters",
  "Tên lớp mới tối thiểu 2 ký tự": "New class name must be at least 2 characters",
  "Câu hỏi bình chọn không được để trống": "Poll question cannot be empty",
  "Cần ít nhất 2 lựa chọn": "At least 2 options are required",
  "Tên cột điểm không được để trống": "Column title cannot be empty",
  "Vui lòng nhập yêu cầu bài tập SGK": "Please enter the textbook assignment instructions",
  "Không tìm thấy cột điểm giấy.": "Paper grade column not found.",
  "Ngày kiểm tra không hợp lệ.": "Invalid test date.",
  "Học sinh không thuộc lớp học này hoặc tài khoản đang bị xoá.":
    "Student is not active in this class.",
  "Đính kèm bài tập không hợp lệ hoặc thuộc lớp khác.":
    "Invalid assignment attachment or belongs to another class.",
  "Vui lòng tải file Excel (.xlsx) lên để nhập điểm.":
    "Please upload an Excel (.xlsx) file to import grades.",
  "Không có điểm hợp lệ nào để lưu.": "No valid grade entries to save.",
  "Không tìm thấy câu hỏi trong ngân hàng.": "Question not found in the bank.",
  "Bạn không có quyền chỉnh sửa câu hỏi này.": "You do not have permission to edit this question.",
  "Bạn không có quyền xoá câu hỏi này.": "You do not have permission to delete this question.",
  "Không tìm thấy câu hỏi nguồn.": "Source question field not found.",
  "Kho câu hỏi không đủ câu cho ma trận đề.": "Not enough questions in the bank to match this matrix.",
  "Tên kỳ thi tối thiểu 2 ký tự": "Exam session title must be at least 2 characters.",
  "Không tìm thấy kỳ thi.": "Exam session not found.",
  "Bạn không có quyền xem kỳ thi này.": "You do not have permission to access this exam session.",

  // Schedule & Attendance (Phase 23)
  "Giờ phải theo định dạng HH:MM": "Time must be in HH:MM format.",
  "Giờ kết thúc phải sau giờ bắt đầu.": "End time must be after start time.",
  "Link phòng học phải bắt đầu bằng http:// hoặc https://":
    "Meeting URL must start with http:// or https://.",
  "Tên buổi học tối thiểu 2 ký tự": "Session title must be at least 2 characters.",
  "Thời gian kết thúc phải sau thời gian bắt đầu.":
    "End time must be after start time.",
  "Không tìm thấy quy tắc lịch học.": "Schedule rule not found.",
  "Không tìm thấy buổi học.": "Class session not found.",
  "Không thể điểm danh buổi học đã bị huỷ.":
    "Cannot record attendance for a cancelled session.",
  "Danh sách điểm danh có học sinh không thuộc lớp học.":
    "Attendance list contains a student who is not an active member of this class.",
  "Bài giảng hoặc bài tập đính kèm không thuộc lớp này.":
    "Selected lesson or assignment does not belong to this class.",
  "Danh sách điểm danh không được trống.": "Attendance records cannot be empty.",

  // Flashcards, Parent Messaging & Push Notifications (Phase 24)
  "Mặt trước thẻ không được để trống": "Flashcard front text cannot be empty.",
  "Mặt sau thẻ không được để trống": "Flashcard back text cannot be empty.",
  "Tên bộ thẻ tối thiểu 2 ký tự": "Deck title must be at least 2 characters.",
  "Bộ thẻ cần ít nhất 1 thẻ": "A flashcard deck must contain at least 1 card.",
  "Không tìm thấy bộ thẻ.": "Flashcard deck not found.",
  "Không tìm thấy thẻ trong bộ thẻ này.": "Flashcard not found in this deck.",
  "Bạn không có quyền truy cập bộ thẻ này.": "You do not have access to this flashcard deck.",
  "Không trích xuất được thẻ nào từ phiếu bài tập này.":
    "No vocabulary or text questions could be extracted into flashcards from this worksheet.",
  "Chỉ giáo viên mới tạo được bộ thẻ gắn cho cả lớp.":
    "Only teachers can assign a flashcard deck to a class.",
  "Nội dung tin nhắn không được để trống": "Message content cannot be empty.",
  "Không tìm thấy cuộc hội thoại.": "Conversation thread not found.",
  "Bạn không có quyền tham gia cuộc hội thoại này.":
    "You do not have permission to access this conversation.",
  "Không tìm thấy phụ huynh đã liên kết với học sinh này.":
    "No verified parent link found for this student.",
  "Máy chủ chưa cấu hình VAPID Web Push.": "Web Push VAPID keys are not configured on the server.",

  // Library Folders, Versions, Discover, AI & Public Practice (Phase 25)
  "Tên thư mục không được để trống": "Folder name cannot be empty.",
  "Không tìm thấy thư mục.": "Folder not found.",
  "Không thể đặt thư mục con làm thư mục cha (tạo vòng lặp).":
    "Cannot move a folder inside itself or its own descendant.",
  "Không tìm thấy phiên bản phiếu bài tập.": "Worksheet version not found.",
  "Không tìm thấy học liệu công khai này.": "Public worksheet not found or is hidden.",
  "Chỉ quản trị viên mới kiểm duyệt được báo cáo nội dung.":
    "Only administrators can moderate content reports.",
  "Hệ thống chưa bật AI (chưa cấu hình GEMINI_API_KEY).":
    "AI question generation is not enabled yet (missing GEMINI_API_KEY).",
  "Bạn đã dùng hết lượt tạo câu hỏi AI trong ngày hôm nay.":
    "You have reached your daily AI question generation limit for today.",
  "Gemini API trả về lỗi hoặc không phản hồi hợp lệ.":
    "Gemini API returned an invalid response or failed.",
  "Vui lòng mô tả lý do báo cáo (tối thiểu 5 ký tự)":
    "Please describe the report reason (at least 5 characters).",
  "Vui lòng nhập nội dung nguồn (tối thiểu 10 ký tự)":
    "Please enter source material (at least 10 characters).",
  "Vui lòng nhập họ tên để làm bài": "Please enter your name to submit.",
  "Liên kết luyện tập công khai không tồn tại hoặc đã tắt.":
    "This public practice link does not exist or has been disabled.",

  // Parent & admin
  "Chỉ học sinh xem được danh sách mã liên kết của mình.":
    "Only students can view their own parent invite codes.",
  "Thiếu studentId.": "Missing studentId.",
  "Học sinh không thuộc lớp của bạn.": "Student does not belong to your class.",
  "Bạn không có quyền tạo mã liên kết phụ huynh.":
    "You do not have permission to generate a parent link code.",
  "Chỉ tạo được mã liên kết phụ huynh cho tài khoản học sinh.":
    "Parent link codes can only be generated for student accounts.",
  "Không thể tạo mã liên kết. Vui lòng thử lại.":
    "Could not generate a link code. Please try again.",
  "Mã liên kết không tồn tại.": "Link code does not exist.",
  "Mã liên kết này đã được sử dụng.": "This link code has already been used.",
  "Mã liên kết đã hết hạn (quá 7 ngày).": "This link code has expired (older than 7 days).",
  "Không tìm thấy học sinh.": "Student not found.",
  "Không thể tự khoá tài khoản quản trị viên của chính bạn.":
    "You cannot lock your own administrator account.",
  "Không thể tự hạ quyền quản trị viên của chính bạn.":
    "You cannot demote your own administrator account.",
  "Không tìm thấy người dùng.": "User not found.",
  "Hệ thống phải còn ít nhất một quản trị viên đang hoạt động.":
    "The system must retain at least one active administrator.",
  "Tài khoản phụ huynh không hợp lệ.": "Invalid parent account.",
  "Tài khoản học sinh không hợp lệ.": "Invalid student account.",
  "Vui lòng chọn giáo viên nhận.": "Please select a recipient teacher.",
  "Người nhận phải khác người chuyển.": "Recipient must be different from the source user.",
  "Không tìm thấy người dùng cần chuyển dữ liệu.": "Source user not found.",
  "Người nhận phải là giáo viên hoặc quản trị viên đang hoạt động.":
    "Recipient must be an active teacher or administrator.",
  "Một hoặc nhiều lớp học / worksheet không thuộc quyền sở hữu của tài khoản nguồn.":
    "One or more selected classes or worksheets do not belong to the source account.",
  "Không có lớp học hoặc worksheet nào được chọn để chuyển.":
    "No classes or worksheets were selected for transfer.",
  "File không phải định dạng Excel (.xlsx) hợp lệ.":
    "File is not a valid Excel (.xlsx) spreadsheet.",
  "Không tìm thấy dữ liệu tài khoản nào trong file Excel.":
    "No account rows were found in the Excel file.",
  "Không có dòng hợp lệ nào để tạo tài khoản.":
    "There are no valid rows to create accounts.",
  "Chỉ quản trị viên được nhập tài khoản hàng loạt.":
    "Only administrators can bulk import accounts.",
  "Chỉ quản trị viên được tải file mật khẩu tạm.":
    "Only administrators can download temporary password files.",
  "Không tìm thấy file mật khẩu tạm.": "Temporary password file not found.",
  "Bạn không có quyền tải file mật khẩu tạm này.":
    "You do not have permission to download this temporary password file.",
  "File mật khẩu tạm đã được tải trước đó hoặc đã hết hạn.":
    "The temporary password file has already been downloaded or expired.",
  "Chưa cấu hình khoá mã hoá (TOTP_ENCRYPTION_KEY hoặc AUTH_SECRET).":
    "Encryption key is not configured (TOTP_ENCRYPTION_KEY or AUTH_SECRET).",
  "Không tìm thấy khoá mã hoá phù hợp để giải mã dữ liệu bảo mật.":
    "No matching encryption key found to decrypt secure data.",
  "Dữ liệu mã hoá không hợp lệ.": "Invalid encrypted payload.",
  "Không giải mã được dữ liệu bảo mật. Khoá mã hoá có thể đã thay đổi.":
    "Could not decrypt secure data. The encryption key may have changed.",
  "Xác thực 2 bước (2FA) chỉ áp dụng cho tài khoản quản trị viên.":
    "Two-factor authentication (2FA) is only available for administrator accounts.",
  "Xác thực 2 bước đã được bật trên tài khoản này.":
    "Two-factor authentication is already enabled on this account.",
  "Vui lòng tạo mã QR thiết lập 2FA trước khi xác nhận.":
    "Please generate the 2FA setup QR code before verifying.",
  "Mã xác thực 6 số không đúng hoặc đã hết hạn.":
    "The 6-digit verification code is incorrect or expired.",
  "Xác thực 2 bước hiện chưa được bật.":
    "Two-factor authentication is not currently enabled.",
  "Nhập mã xác thực 6 số": "Enter the 6-digit verification code.",
  "Nhập mã xác thực 6 số hoặc mã dự phòng":
    "Enter a 6-digit verification code or backup code.",
  "Email này đã được đăng ký.": "This email is already registered.",
  "Số điện thoại này đã được đăng ký.": "This phone number is already registered.",
  "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.":
    "Your session has expired. Please sign in again.",
  "Bạn không có quyền tạo tài khoản.": "You do not have permission to create accounts.",
  "Giáo viên chỉ được tạo tài khoản Học sinh hoặc Phụ huynh.":
    "Teachers can only create Student or Parent accounts.",
  "Vui lòng chọn lớp học.": "Please select a class.",
  "Vui lòng chọn học sinh để liên kết với phụ huynh.":
    "Please select a student to link with this parent.",
  "Học sinh không thuộc lớp này.": "This student is not enrolled in this class.",
  "Không tìm thấy học sinh để liên kết.": "Student to link was not found.",
  "Bạn chỉ đặt lại được mật khẩu cho học sinh / phụ huynh trong lớp của mình.":
    "You can only reset passwords for students and parents in your own classes.",
  "Bạn không có quyền đặt lại mật khẩu.": "You do not have permission to reset passwords.",
  "Chỉ quản trị viên được xoá tài khoản.": "Only administrators can delete accounts.",
  "Không thể tự xoá tài khoản của chính bạn.": "You cannot delete your own account.",
  "Email xác nhận không khớp.": "Confirmation email does not match.",
  "Mật khẩu hiện tại không đúng.": "Current password is incorrect.",
  "Mật khẩu mới phải khác mật khẩu hiện tại.":
    "New password must differ from your current password.",
  "Ảnh đại diện tối đa 2MB.": "Profile picture must not exceed 2MB.",
  "Chỉ nhận ảnh JPG, PNG hoặc WebP.": "Only JPG, PNG, or WebP images are accepted.",
  "Vui lòng chọn ảnh.": "Please choose an image.",
  "Bạn thử quá nhiều lần. Vui lòng thử lại sau.":
    "Too many attempts. Please try again later.",
  "Số điện thoại không hợp lệ": "Invalid phone number.",
  "Ngày sinh không hợp lệ": "Invalid date of birth.",
  "Ngày sinh không được ở tương lai": "Date of birth cannot be in the future.",
  "Giới tính không hợp lệ": "Invalid gender option.",
  "Giới thiệu tối đa 300 ký tự": "Bio must not exceed 300 characters.",
  "Nhập mật khẩu hiện tại": "Please enter your current password.",
  "Mật khẩu mới tối thiểu 8 ký tự": "New password must be at least 8 characters.",

  // Submission & proctoring
  "Không tìm thấy bài làm.": "Submission not found.",
  "Không tìm thấy bài làm trong ca thi này.": "Submission not found in this exam session.",
  "Bài làm đã kết thúc.": "This submission has already ended.",
  "Bài làm đã nộp, không thể khoá/mở khoá/thu bài.":
    "Submission already submitted; cannot lock, unlock, or collect.",
  "Bài làm đã nộp, không thể chỉnh sửa.": "Submission already submitted and cannot be edited.",
  "Bài làm đã được nộp trước đó.": "This submission has already been submitted.",
  "Bài làm đã nộp, không thể phát thêm lượt nghe mới.":
    "Submission already submitted; no further audio plays are allowed.",
  "Bài làm đang bị khoá do vi phạm quy chế thi.":
    "Your submission is locked due to an exam rule violation.",
  "Bài làm đang bị khoá.": "This submission is locked.",
  "Bài làm đang bị khoá. Không thể tự nộp.":
    "This submission is locked and cannot be self-submitted.",
  "Phiên bài làm đã được đặt lại từ đầu. Đáp án cũ bị từ chối.":
    "This attempt was restarted. Previous answers were rejected.",
  "Phiên làm bài đã bị đặt lại, vui lòng tải lại trang.":
    "Your session was restarted. Please reload the page.",
  "Đã hết thời gian làm bài. Hệ thống đã tự động nộp bài của bạn.":
    "Time is up. Your work has been submitted automatically.",
  "Đã hết thời gian làm bài.": "Time is up.",
  "Học sinh chưa nộp bài, chưa thể chấm điểm.":
    "The student has not submitted yet; grading is unavailable.",
  "Bài tập chưa đến thời gian mở.": "This assignment is not open yet.",
  "Đã quá hạn nộp bài tập này.": "The deadline for this assignment has passed.",
  "Bạn cần đọc và đồng ý nội quy phòng thi trước khi bắt đầu.":
    "Please read and agree to the exam rules before starting.",
  "Bài thi yêu cầu kiểm tra và đồng ý bật camera AI trước khi bắt đầu.":
    "This exam requires testing and consenting to camera proctoring before starting.",
  "Bài thi này yêu cầu mở bằng Safe Exam Browser (thiếu header X-SafeExamBrowser-ConfigKeyHash).":
    "This exam requires Safe Exam Browser (missing X-SafeExamBrowser-ConfigKeyHash header).",
  "Cấu hình Safe Exam Browser không khớp với bài thi này.":
    "Safe Exam Browser configuration does not match this exam.",
  "Gửi ảnh giám sát quá nhanh, vui lòng thử lại sau.":
    "Sending proctoring snapshots too quickly; please try again shortly.",
  "Bài tập này không bật lưu ảnh giám sát.":
    "Proctoring snapshots are not enabled for this assignment.",
  "Thiếu ảnh chụp giám sát.": "Missing proctoring snapshot.",
  "Chỉ chấp nhận định dạng ảnh JPEG.": "Only JPEG images are accepted.",
  "Ảnh giám sát vượt quá giới hạn 120KB.": "Proctoring snapshot exceeds the 120KB limit.",
  "Dữ liệu ảnh JPEG không hợp lệ.": "Invalid JPEG image data.",

  // Google Drive
  "Google Drive chưa được cấu hình. Quản trị viên cần đặt GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET và DRIVE_ENCRYPTION_KEY.":
    "Google Drive is not configured. Admin must set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and DRIVE_ENCRYPTION_KEY.",
  "Chưa cấu hình DRIVE_ENCRYPTION_KEY (tối thiểu 32 ký tự).":
    "DRIVE_ENCRYPTION_KEY is not configured (minimum 32 characters).",
  "Yêu cầu không hợp lệ (sai nguồn Origin).": "Invalid request origin.",
  "Dữ liệu mã hoá Drive không hợp lệ.": "Invalid encrypted Drive payload.",
  "Không giải mã được kết nối Google Drive. Có thể khoá DRIVE_ENCRYPTION_KEY đã thay đổi; hãy kết nối lại.":
    "Could not decrypt Google Drive credentials. DRIVE_ENCRYPTION_KEY may have changed; please reconnect.",
  "Google từ chối mã xác thực OAuth. Vui lòng thử kết nối lại.":
    "Google rejected the OAuth authorization code. Please reconnect.",
  "Chưa kết nối Google Drive.": "Google Drive is not connected.",
  "Google Drive đã bị ngắt kết nối. Vui lòng kết nối lại.":
    "Google Drive has been disconnected. Please reconnect.",
  "Kết nối Google Drive đã bị thu hồi hoặc hết hiệu lực. Vui lòng kết nối lại.":
    "Google Drive connection was revoked or expired. Please reconnect.",
  "Không làm mới được phiên Google Drive. Vui lòng thử lại.":
    "Could not refresh the Google Drive session. Please try again.",
  "Google Drive đã đầy. Hãy giải phóng dung lượng rồi thử lại.":
    "Google Drive storage is full. Please free up space and try again.",
  "Google Drive đang giới hạn tần suất. Vui lòng thử lại sau ít phút.":
    "Google Drive rate limit reached. Please try again in a few minutes.",
  "Google Drive từ chối yêu cầu không hợp lệ.": "Google Drive rejected the request.",
  "Phiên Google Drive không hợp lệ. Vui lòng kết nối lại.":
    "Invalid Google Drive session. Please reconnect.",
  "Google Drive từ chối quyền truy cập.": "Google Drive denied access.",
  "Không tìm thấy tệp trên Google Drive.": "File not found on Google Drive.",
  "Google Drive tạm thời không phản hồi. Vui lòng thử lại.":
    "Google Drive is temporarily unavailable. Please try again.",
  "Google Drive không tạo được phiên tải lên.":
    "Google Drive could not create an upload session.",
  "Phiên tải lên Google Drive đã hết hạn.": "Google Drive upload session has expired.",
  "Tải tệp lên Google Drive chưa hoàn tất.": "Google Drive upload did not finish.",

  // Leaderboard
  "Giáo viên đã tắt bảng xếp hạng cho bài tập này.":
    "The teacher has turned off the leaderboard for this assignment.",
  "Bảng xếp hạng sẽ hiển thị sau khi hết hạn nộp bài.":
    "The leaderboard opens after the deadline.",
  "Hãy nộp bài trước để xem bảng xếp hạng.":
    "Submit your work to see the leaderboard.",
  "Giáo viên đã tắt bảng xếp hạng cho các bài tập của lớp.":
    "The teacher has turned off the leaderboard for this class.",

  // Zod validator messages
  "Họ tên tối thiểu 2 ký tự": "Full name must be at least 2 characters.",
  "Email không hợp lệ": "Invalid email address.",
  "Mật khẩu tối thiểu 6 ký tự": "Password must be at least 6 characters.",
  "Tên lớp tối thiểu 2 ký tự": "Class name must be at least 2 characters.",
  "Mã lớp không hợp lệ": "Invalid class code.",
  "Nội dung không được để trống": "Content cannot be empty.",
  "Bình luận không được để trống": "Comment cannot be empty.",
  "Tiêu đề tối thiểu 2 ký tự": "Title must be at least 2 characters.",
  "Ô Overlay bắt buộc có toạ độ chuẩn hoá (pageIndex, x, y, w, h).":
    "Overlay fields require normalized coordinates (pageIndex, x, y, w, h).",
  "Tên file nghe không được để trống": "Audio title cannot be empty.",
  "Vui lòng chọn ít nhất 1 lớp": "Please select at least one class.",
  "Tên bài giao tối thiểu 2 ký tự": "Assignment title must be at least 2 characters.",
  "URL không hợp lệ": "Invalid URL.",
};

const PATTERN_EN_RULES: Array<[RegExp, (...args: string[]) => string]> = [
  [
    /^Bạn đã đăng ký quá nhiều lần\. Vui lòng thử lại sau (\d+) giây\.$/,
    (_m, sec) => `Too many registration attempts. Please try again in ${sec} seconds.`,
  ],
  [
    /^File vượt quá dung lượng tối đa (\d+)MB\.$/,
    (_m, mb) => `File exceeds the maximum size of ${mb}MB.`,
  ],
  [
    /^Dung lượng file nghe vượt quá giới hạn (\d+)MB\.$/,
    (_m, mb) => `Audio file exceeds the ${mb}MB size limit.`,
  ],
  [
    /^Bạn đã dùng hết (\d+) lượt làm bài cho phép\.$/,
    (_m, n) => `You have used all ${n} allowed attempt(s).`,
  ],
  [
    /^Bạn đã dùng hết (\d+) lượt nghe cho file "(.+)"\.$/,
    (_m, n, title) => `You have used all ${n} play(s) for "${title}".`,
  ],
  [
    /^Worksheet đã có (\d+) bài làm của học sinh\. Hãy xoá các bài tập đã giao trước nếu thật sự muốn xoá worksheet\.$/,
    (_m, count) =>
      `This worksheet already has ${count} student submission(s). Delete its assignments first if you really want to delete it.`,
  ],
  [
    /^Không thể xoá câu (.+) vì đã có học sinh trả lời\.$/,
    (_m, labels) => `Cannot delete question(s) ${labels} because students have already answered them.`,
  ],
  [
    /^Email này thuộc một tài khoản đang ở thùng rác\. Hãy khôi phục hoặc xoá vĩnh viễn tài khoản đó trước\.$/,
    () => "This email belongs to an account in the trash. Restore it or delete it permanently first.",
  ],
  [
    /^Chỉ xoá vĩnh viễn được tài khoản đã nằm trong thùng rác\.$/,
    () => "Only accounts that are already in the trash can be deleted permanently.",
  ],
  [
    /^Không thể đổi vai trò: tài khoản này đang sở hữu (\d+) lớp học và (\d+) bài tập\. Hãy xoá hoặc chuyển chúng trước\.$/,
    (_m, c, w) =>
      `Cannot change the role: this account still owns ${c} class(es) and ${w} worksheet(s). Delete or transfer them first.`,
  ],
  [
    /^Không thể xoá vĩnh viễn: Google Drive riêng của tài khoản này đang chứa (\d+) file thuộc lớp\/worksheet đã chuyển cho người khác\. Xoá vĩnh viễn sẽ làm hỏng các file đó\.$/,
    (_m, n) =>
      `Cannot delete permanently: this account's personal Google Drive still holds ${n} file(s) used by classes/worksheets transferred to someone else. Deleting it would break those files.`,
  ],
  [
    /^Mỗi lần chỉ nhập tối đa (\d+) tài khoản\.$/,
    (_m, max) => `At most ${max} accounts can be imported at once.`,
  ],
  [
    /^Không thể đổi loại câu (.+) vì đã có học sinh trả lời\.$/,
    (_m, labels) =>
      `Cannot change the type of question(s) ${labels} because students have already answered them.`,
  ],
  [
    /^Điểm phải nằm trong khoảng 0 đến ([0-9.]+)\.$/,
    (_m, max) => `Score must be between 0 and ${max}.`,
  ],
];

const FALLBACK_BY_CODE_EN: Record<string, string> = {
  UNAUTHORIZED: "Please sign in to continue.",
  ACCOUNT_LOCKED: "Your account has been locked.",
  FORBIDDEN: "You do not have permission to perform this action.",
  NOT_FOUND: "Requested resource was not found.",
  VALIDATION_ERROR: "Invalid input data.",
  RATE_LIMITED: "Too many requests. Please try again shortly.",
  INTERNAL_ERROR: "Server error. Please try again later.",
};

export function localizeApiError(message: string, code: string, locale: Locale): string {
  if (locale !== "en") return message;

  const exact = EXACT_EN_MESSAGES[message];
  if (exact) return exact;

  for (const [pattern, formatter] of PATTERN_EN_RULES) {
    const match = message.match(pattern);
    if (match) {
      return formatter(...match);
    }
  }

  // If the message contains Vietnamese diacritics and we have a code fallback, prefer clean EN.
  if (/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(message)) {
    return FALLBACK_BY_CODE_EN[code] ?? message;
  }

  return message;
}

const NOTIFICATION_PATTERNS: Array<[RegExp, (...args: string[]) => string]> = [
  [/^Yêu cầu vào lớp (.+)$/, (_m, cls) => `Join request for ${cls}`],
  [
    /^(.+) vừa xin tham gia lớp (.+)\.$/,
    (_m, student, cls) => `${student} requested to join ${cls}.`,
  ],
  [/^Đã được duyệt vào lớp (.+)$/, (_m, cls) => `Approved to join ${cls}`],
  [
    /^Giáo viên đã chấp nhận yêu cầu tham gia lớp (.+)\.$/,
    (_m, cls) => `The teacher approved your request to join ${cls}.`,
  ],
  [/^Bài tập mới: (.+)$/, (_m, title) => `New assignment: ${title}`],
  [
    /^Lớp (.+) có bài tập mới\. Hạn nộp: (.+)\.$/,
    (_m, cls, due) => `${cls} has a new assignment. Due: ${due}.`,
  ],
  [
    /^Lớp (.+) có bài tập mới\.$/,
    (_m, cls) => `${cls} has a new assignment.`,
  ],
  [/^(.+) đã nộp bài \(Trễ hạn\)$/, (_m, name) => `${name} submitted (Late)`],
  [/^(.+) đã nộp bài$/, (_m, name) => `${name} submitted an assignment`],
  [/^Đã có điểm bài (.+)$/, (_m, title) => `Graded: ${title}`],
  [/^Giáo viên đã chấm xong bài (.+)\.$/, (_m, title) => `Your teacher finished grading ${title}.`],
  [/^Giáo viên đã mở khoá bài thi$/, () => "Exam unlocked by teacher"],
  [
    /^Bài "(.+)" đã được mở khoá\. Bạn có thể tiếp tục làm bài\.$/,
    (_m, title) => `"${title}" has been unlocked. You can continue working.`,
  ],
  [/^Nhắc nhở từ giáo viên \((.+)\)$/, (_m, title) => `Reminder from teacher (${title})`],
  [
    /^(.+) đạt ([0-9.]+)\/10 bài (.+)$/,
    (_m, student, score, title) => `${student} scored ${score}/10 on ${title}`,
  ],
  [
    /^Xem báo cáo chi tiết và nhận xét của (.+) trong Cổng phụ huynh\.$/,
    (_m, teacher) => `View the full report and comments from ${teacher} in the Parent Portal.`,
  ],
  [/^Deploy thất bại \((.+)\)$/, (_m, sha) => `Deployment failed (${sha})`],
  [
    /^Triển khai phiên bản (.+) thất bại\. Hệ thống đã giữ\/khôi phục phiên bản trước\. Kiểm tra cron\.log trên máy chủ\.$/,
    (_m, sha) =>
      `Deployment of revision ${sha} failed. The previous version was retained or restored. Check cron.log on the server.`,
  ],
  [/^Sắp hết hạn nộp: (.+)$/, (_m, title) => `Due soon: ${title}`],
  [
    /^Còn khoảng (\d+) giờ để nộp bài cho lớp (.+)\.$/,
    (_m, hours, cls) => `About ${hours} hour(s) left to submit for ${cls}.`,
  ],
  [/^Ngoại lệ mới cho bài (.+)$/, (_m, title) => `Assignment exception granted: ${title}`],
  [/^Bài "(.+)" cần sửa lại$/, (_m, title) => `Revision requested: ${title}`],
  [
    /^Giáo viên đã trả bài kèm nhận xét: (.+)$/,
    (_m, comment) => `Teacher returned your work with feedback: ${comment}`,
  ],
  [
    /^Giáo viên đã trả bài để bạn chỉnh sửa và nộp lại\.$/,
    () => "Your teacher returned this submission for revision and resubmission.",
  ],
  [
    /^Điểm danh: (.+) vắng không phép$/,
    (_m, name) => `Attendance: ${name} marked absent (unexcused)`,
  ],
  [
    /^Điểm danh: (.+) đi muộn$/,
    (_m, name) => `Attendance: ${name} arrived late`,
  ],
  [
    /^Điểm danh: (.+) vắng có phép$/,
    (_m, name) => `Attendance: ${name} marked excused`,
  ],
  [
    /^Tin nhắn mới từ (.+)$/,
    (_m, name) => `New message from ${name}`,
  ],
  [
    /^Báo cáo tuần \((.+)\): (.+)$/,
    (_m, week, name) => `Weekly report (${week}): ${name}`,
  ],
];

function localizeLine(text: string, locale: Locale): string {
  if (locale !== "en") return text;
  let result = text;
  for (const [pattern, formatter] of NOTIFICATION_PATTERNS) {
    const match = result.match(pattern);
    if (match) return formatter(...match);
  }
  result = result
    .replace(/Chờ chấm tự luận/g, "Awaiting essay grading")
    .replace(/Chưa công bố điểm/g, "Score hidden")
    .replace(/Không giới hạn/g, "No deadline");
  return result;
}

export function localizeNotification<T extends { title: string; body: string }>(
  item: T,
  locale: Locale
): T {
  if (locale !== "en") return item;
  return {
    ...item,
    title: localizeLine(item.title, locale),
    body: localizeLine(item.body, locale),
  };
}
