import React from 'react';

export function PrivacyPolicy() {
  return (
    <div style={s.page}>
      <div style={s.container}>
        <div style={s.header}>
          <a href="/" style={s.logo}>ModuShare</a>
        </div>
        <div style={s.content}>
          <h1 style={s.h1}>Privacy Policy</h1>
          <p style={s.meta}>Effective Date: March 21, 2026</p>

          <p style={s.intro}>
            Extory ("we," "us," or "our") operates ModuShare. This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our clipboard synchronization service.
          </p>

          <Section title="1. Information We Collect">
            <p><strong>Account Information:</strong></p>
            <ul style={s.ul}>
              <li><strong>Email address</strong> — used to identify your account and send service communications.</li>
              <li><strong>Username</strong> — your display name within the Service.</li>
              <li><strong>Password</strong> — stored as a one-way bcrypt hash; we never store your plaintext password.</li>
              <li><strong>Google Account info</strong> (if you sign in with Google) — your Google user ID, email, display name, and profile picture provided by Google OAuth.</li>
            </ul>

            <p style={{ marginTop: '1rem' }}><strong>Clipboard Content:</strong></p>
            <ul style={s.ul}>
              <li>Text copied on your devices while clipboard sync is enabled.</li>
              <li>Images copied on your devices (up to 512 KB per item).</li>
              <li>Clipboard items are stored temporarily and are automatically deleted after 10 minutes.</li>
            </ul>

            <p style={{ marginTop: '1rem' }}><strong>Technical Information:</strong></p>
            <ul style={s.ul}>
              <li>Device identifiers (randomly generated per device session; not linked to hardware).</li>
              <li>Server-side logs including timestamps and IP addresses for security monitoring.</li>
              <li>Connection status and sync events.</li>
            </ul>
          </Section>

          <Section title="2. How We Use Your Information">
            <ul style={s.ul}>
              <li><strong>Provide the Service</strong> — transmit clipboard content between your devices and authorized share partners.</li>
              <li><strong>Authentication</strong> — verify your identity when you sign in.</li>
              <li><strong>Clipboard Sharing</strong> — enable you to share clipboard streams with other users you invite.</li>
              <li><strong>Storage Management</strong> — enforce per-account storage limits and automatically prune old clipboard data.</li>
              <li><strong>Security</strong> — detect and prevent unauthorized access, abuse, and policy violations.</li>
              <li><strong>Service Improvement</strong> — analyze aggregate usage patterns to improve performance and features.</li>
              <li><strong>Communications</strong> — send important account or service notifications (we do not send marketing emails without your consent).</li>
            </ul>
          </Section>

          <Section title="3. Clipboard Data Handling">
            <p>We treat your clipboard content as sensitive data:</p>
            <ul style={s.ul}>
              <li>Clipboard items are transmitted over TLS-encrypted connections (HTTPS/WSS).</li>
              <li>Clipboard data is stored in a server-side database only as long as needed for sync (maximum 10 minutes by default).</li>
              <li>We do not analyze, index, or sell your clipboard content.</li>
              <li>Clipboard data is only accessible to you and the share partners you have explicitly authorized.</li>
              <li>When you delete a clipboard item or it expires, it is marked as deleted and excluded from sync. Deleted items are purged on a regular schedule.</li>
            </ul>
          </Section>

          <Section title="4. Clipboard Sharing with Other Users">
            <p>When you use the clipboard sharing feature:</p>
            <ul style={s.ul}>
              <li>You can invite another user by their email address to share clipboard streams.</li>
              <li>The invitation requires the other party's explicit acceptance before sharing begins.</li>
              <li>Either party can remove the sharing relationship at any time.</li>
              <li>We notify both parties via WebSocket and system notifications about sharing events.</li>
              <li>Once sharing is removed, no further clipboard data is exchanged between those accounts.</li>
            </ul>
          </Section>

          <Section title="5. Google OAuth">
            <p>If you choose to sign in with Google:</p>
            <ul style={s.ul}>
              <li>We receive your Google user ID, email, name, and profile picture from Google.</li>
              <li>We use this data only to create and authenticate your ModuShare account.</li>
              <li>We do not access your Google Drive, Gmail, or any other Google services.</li>
              <li>Your use of Google Sign-In is also subject to <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={s.link}>Google's Privacy Policy</a>.</li>
            </ul>
          </Section>

          <Section title="6. Data Sharing with Third Parties">
            <p>We do not sell, rent, or trade your personal information. We may share information only in these limited circumstances:</p>
            <ul style={s.ul}>
              <li><strong>With your consent</strong> — when you explicitly authorize sharing (e.g., clipboard sharing with another user).</li>
              <li><strong>Service providers</strong> — infrastructure and hosting providers who process data on our behalf under confidentiality obligations.</li>
              <li><strong>Legal requirements</strong> — when required by law, court order, or to protect the rights and safety of users or the public.</li>
            </ul>
          </Section>

          <Section title="7. Data Retention">
            <ul style={s.ul}>
              <li><strong>Clipboard items:</strong> Automatically purged 10 minutes after creation, or immediately when manually deleted.</li>
              <li><strong>Account data:</strong> Retained for as long as your account is active. You may request deletion by contacting us.</li>
              <li><strong>Access tokens:</strong> Short-lived (expire after a set period); refresh tokens are rotated on each use.</li>
              <li><strong>Server logs:</strong> Retained for up to 30 days for security purposes.</li>
            </ul>
          </Section>

          <Section title="8. Security">
            <p>We implement industry-standard security measures:</p>
            <ul style={s.ul}>
              <li>All data in transit is encrypted via TLS (HTTPS and WSS).</li>
              <li>Passwords are hashed using bcrypt with a salt.</li>
              <li>Access tokens are signed JWTs with short expiration periods.</li>
              <li>WebSocket connections are authenticated via token-based protocols.</li>
              <li>We conduct periodic security reviews of our infrastructure.</li>
            </ul>
            <p style={{ marginTop: '0.75rem' }}>However, no security system is perfect. We cannot guarantee absolute security of your data.</p>
          </Section>

          <Section title="9. Your Rights">
            <p>Depending on your location, you may have the following rights:</p>
            <ul style={s.ul}>
              <li><strong>Access</strong> — request a copy of the personal data we hold about you.</li>
              <li><strong>Correction</strong> — request correction of inaccurate data.</li>
              <li><strong>Deletion</strong> — request deletion of your account and associated data.</li>
              <li><strong>Portability</strong> — request a machine-readable export of your data.</li>
              <li><strong>Objection</strong> — object to certain types of data processing.</li>
            </ul>
            <p style={{ marginTop: '0.75rem' }}>To exercise any of these rights, contact us at <a href="mailto:privacy@extory.co" style={s.link}>privacy@extory.co</a>.</p>
          </Section>

          <Section title="10. Children's Privacy">
            <p>ModuShare is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, please contact us and we will promptly delete it.</p>
          </Section>

          <Section title="11. Cookies and Local Storage">
            <ul style={s.ul}>
              <li>We use HTTP cookies to store encrypted refresh tokens for authentication. These are httpOnly and secure cookies.</li>
              <li>The web app uses browser sessionStorage to store a temporary device identifier.</li>
              <li>Desktop clients store access tokens and settings in the OS-level secure app store.</li>
              <li>We do not use third-party advertising cookies or tracking pixels.</li>
            </ul>
          </Section>

          <Section title="12. Changes to This Policy">
            <p>We may update this Privacy Policy from time to time. We will notify you of material changes by posting a notice in the Service or sending an email. The "Effective Date" at the top of this page indicates when the policy was last updated. Your continued use of the Service after changes take effect constitutes acceptance of the updated policy.</p>
          </Section>

          <Section title="13. Contact Us">
            <p>If you have questions or concerns about this Privacy Policy, please contact us:</p>
            <ul style={s.ul}>
              <li>Email: <a href="mailto:privacy@extory.co" style={s.link}>privacy@extory.co</a></li>
              <li>General support: <a href="mailto:support@extory.co" style={s.link}>support@extory.co</a></li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2 style={{
        fontSize: '1.1rem', fontWeight: 700, color: '#1d1d1f',
        marginBottom: '0.75rem', paddingBottom: '0.5rem',
        borderBottom: '1px solid #f0f0f0',
      }}>{title}</h2>
      <div style={{ color: '#444', lineHeight: 1.75, fontSize: '0.9375rem' }}>{children}</div>
    </section>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#fafafa' },
  container: { maxWidth: 760, margin: '0 auto', padding: '0 1.5rem 4rem' },
  header: {
    padding: '1.25rem 0',
    borderBottom: '1px solid #e5e7eb',
    marginBottom: '2.5rem',
  },
  logo: {
    fontSize: '1.25rem', fontWeight: 700, color: '#6366f1',
    textDecoration: 'none',
  },
  content: {},
  h1: { fontSize: '1.875rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '0.5rem' },
  meta: { fontSize: '0.875rem', color: '#888', marginBottom: '2rem' },
  intro: {
    fontSize: '0.9375rem', color: '#444', lineHeight: 1.75,
    marginBottom: '2rem', padding: '1rem 1.25rem',
    background: '#f0f0ff', borderRadius: 8, borderLeft: '3px solid #6366f1',
  },
  ul: { paddingLeft: '1.5rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  link: { color: '#6366f1', textDecoration: 'none' },
};
