import { getServerConfig } from '../config/env';

export interface PasswordResetEmailPayload {
  to: string;
  name: string;
  resetUrl: string;
  expiresMinutes: number;
}

export interface EmailSender {
  isConfigured(): boolean;
  sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void>;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createDefaultEmailSender(): EmailSender {
  return {
    isConfigured() {
      const { resendApiKey, emailFrom } = getServerConfig();
      return Boolean(resendApiKey && emailFrom);
    },

    async sendPasswordResetEmail({
      to,
      name,
      resetUrl,
      expiresMinutes,
    }: PasswordResetEmailPayload): Promise<void> {
      const { resendApiKey, emailFrom } = getServerConfig();
      if (!resendApiKey || !emailFrom) {
        throw new Error('E-posta gönderim servisi yapılandırılmamış.');
      }

      const safeName = escapeHtml(name);
      const safeUrl = escapeHtml(resetUrl);

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [to],
          subject: 'QUIZORA — Şifre Sıfırlama Bağlantısı',
          text: [
            `Merhaba ${name},`,
            '',
            'QUIZORA öğretmen hesabınız için şifre sıfırlama talebinde bulundunuz.',
            `Yeni şifre belirlemek için aşağıdaki tek kullanımlık bağlantıyı (${expiresMinutes} dakika geçerli) açın:`,
            resetUrl,
            '',
            'Bu talebi siz oluşturmadıysanız bu e-postayı güvenle yok sayabilirsiniz.',
          ].join('\n'),
          html: `
            <div style="font-family:Inter,system-ui,sans-serif;color:#232B3A;max-width:520px;margin:0 auto;padding:24px;background:#FAF7F4;border-radius:16px;border:1px solid #E4DBD4;">
              <h1 style="font-size:20px;margin:0 0 12px;color:#6B1D2F;">QUIZORA Şifre Sıfırlama</h1>
              <p style="font-size:14px;line-height:1.6;">Merhaba <strong>${safeName}</strong>,</p>
              <p style="font-size:14px;line-height:1.6;">
                Öğretmen hesabınız için şifre sıfırlama talebinde bulundunuz. Aşağıdaki tek kullanımlık bağlantı <strong>${expiresMinutes} dakika</strong> boyunca geçerlidir:
              </p>
              <p style="margin:24px 0;">
                <a href="${safeUrl}" style="display:inline-block;background:#6B1D2F;color:#FFFDFB;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px;">
                  Şifremi Sıfırla
                </a>
              </p>
              <p style="font-size:12px;color:#4A5263;line-height:1.5;">
                Bu talebi siz oluşturmadıysanız şifreniz değiştirilmeyecektir. Bu e-postayı güvenle yok sayabilirsiniz.
              </p>
            </div>
          `,
        }),
      });

      if (!response.ok) {
        throw new Error(`E-posta sağlayıcısı hata döndürdü (${response.status}).`);
      }
    },
  };
}
