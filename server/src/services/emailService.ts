import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env['SMTP_HOST'] ?? 'smtp.gmail.com',
  port: parseInt(process.env['SMTP_PORT'] ?? '587', 10),
  secure: false,
  auth: {
    user: process.env['SMTP_USER'],
    pass: process.env['SMTP_PASS'],
  },
});

const FROM = process.env['SMTP_FROM'] ?? 'ModuShare <noreply@extory.co>';
const APP_URL = 'https://modushare.extory.co';

export const emailService = {
  async sendShareInvite(fromUsername: string, fromEmail: string, toEmail: string): Promise<void> {
    const subject = `${fromUsername}님이 ModuShare 클립보드 공유에 초대했습니다`;
    const html = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;margin:0;padding:40px 0;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
      <div style="font-size:2.5rem;">📋</div>
      <h1 style="color:#fff;font-size:1.5rem;margin:12px 0 0;">ModuShare</h1>
      <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:0.9rem;">클립보드 동기화 서비스</p>
    </div>
    <div style="padding:32px;">
      <h2 style="font-size:1.1rem;color:#1d1d1f;margin:0 0 12px;">공유 초대가 도착했습니다</h2>
      <p style="color:#555;line-height:1.6;margin:0 0 24px;">
        <strong>${fromUsername}</strong> (${fromEmail})님이 클립보드 공유에 초대했습니다.<br/>
        ModuShare에 가입하면 Mac, Windows, 웹 브라우저 어디서든 클립보드를 실시간으로 동기화할 수 있습니다.
      </p>
      <a href="${APP_URL}" style="display:block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;text-align:center;padding:14px 24px;border-radius:10px;font-weight:600;font-size:1rem;">
        ModuShare 시작하기 →
      </a>
      <p style="color:#aaa;font-size:0.78rem;margin:24px 0 0;text-align:center;">
        가입 후 <strong>${fromUsername}</strong>님을 친구로 추가하면 클립보드 공유가 시작됩니다.
      </p>
    </div>
    <div style="background:#f5f5f7;padding:16px;text-align:center;">
      <p style="color:#aaa;font-size:0.75rem;margin:0;">
        © 2026 Extory · <a href="${APP_URL}/#/privacy" style="color:#aaa;">개인정보처리방침</a>
      </p>
    </div>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: FROM,
      to: toEmail,
      subject,
      html,
    });
  },
};
