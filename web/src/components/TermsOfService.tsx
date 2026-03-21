import React from 'react';

export function TermsOfService() {
  return (
    <div style={s.page}>
      <div style={s.container}>
        <div style={s.header}>
          <a href="/" style={s.logo}>ModuShare</a>
        </div>
        <div style={s.content}>
          <h1 style={s.h1}>Terms of Service</h1>
          <p style={s.meta}>Effective Date: March 21, 2026</p>

          <p style={s.intro}>
            Welcome to ModuShare. By creating an account or using ModuShare (the "Service"), you agree to these Terms of Service ("Terms"). Please read them carefully.
          </p>

          <Section title="1. About ModuShare">
            <p>ModuShare is a clipboard synchronization service that allows you to share clipboard content (text and images) across multiple devices in real time. The Service is operated by Extory ("we," "us," or "our").</p>
          </Section>

          <Section title="2. Eligibility">
            <p>You must be at least 13 years old to use the Service. By using ModuShare, you represent that you meet this requirement. If you are using the Service on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.</p>
          </Section>

          <Section title="3. Account Registration">
            <ul style={s.ul}>
              <li>You may register with an email address and password, or via Google OAuth.</li>
              <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
              <li>You must provide accurate and complete information when creating an account.</li>
              <li>You are responsible for all activity that occurs under your account.</li>
              <li>You must notify us immediately of any unauthorized use of your account.</li>
            </ul>
          </Section>

          <Section title="4. Clipboard Data and Content">
            <p>ModuShare transmits clipboard content (text and images) between your devices. By using the Service, you acknowledge and agree that:</p>
            <ul style={s.ul}>
              <li>Clipboard content is transmitted over encrypted connections.</li>
              <li>Clipboard items are stored temporarily and are automatically purged after 10 minutes by default.</li>
              <li>You are solely responsible for the content you copy and sync through the Service.</li>
              <li>You must not use the Service to transmit illegal, harmful, or infringing content.</li>
              <li>Storage per account is limited to 20 MB of active clipboard data. Content exceeding this limit will be automatically pruned.</li>
            </ul>
          </Section>

          <Section title="5. Clipboard Sharing">
            <p>ModuShare allows you to share your clipboard stream with other users ("Share Partners"). When you accept a share invitation:</p>
            <ul style={s.ul}>
              <li>Both parties will receive each other's clipboard updates in real time.</li>
              <li>Either party may remove the sharing relationship at any time.</li>
              <li>You are responsible for choosing whom you share with.</li>
              <li>We are not responsible for content shared between users.</li>
            </ul>
          </Section>

          <Section title="6. Desktop Clients">
            <p>ModuShare provides native desktop applications for macOS and Windows. By downloading and using these clients:</p>
            <ul style={s.ul}>
              <li>The client monitors your system clipboard and transmits changes to our servers when sync is enabled.</li>
              <li>You can disable sync at any time from the application menu.</li>
              <li>The client stores your access token locally on your device.</li>
            </ul>
          </Section>

          <Section title="7. Acceptable Use">
            <p>You agree not to:</p>
            <ul style={s.ul}>
              <li>Use the Service for any unlawful purpose or in violation of any applicable laws.</li>
              <li>Transmit malware, viruses, or any harmful code via clipboard sync.</li>
              <li>Attempt to gain unauthorized access to other accounts or our systems.</li>
              <li>Reverse engineer, decompile, or attempt to extract the source code of the Service.</li>
              <li>Use automated tools to spam, abuse, or overload the Service.</li>
              <li>Transmit sensitive personal data (passwords, payment card numbers, government IDs) through clipboard sync unless you understand and accept the associated risks.</li>
            </ul>
          </Section>

          <Section title="8. Service Availability">
            <p>We strive to keep ModuShare available at all times, but we do not guarantee uninterrupted service. We may modify, suspend, or discontinue any part of the Service at any time. We are not liable for any loss resulting from service interruptions.</p>
          </Section>

          <Section title="9. Intellectual Property">
            <p>The ModuShare name, logo, and Service are owned by Extory. You retain all rights to the content you transmit through the Service. By using the Service, you grant us a limited license to transmit and store your clipboard data solely for the purpose of providing the Service.</p>
          </Section>

          <Section title="10. Termination">
            <p>We may suspend or terminate your account if you violate these Terms. You may delete your account at any time by contacting us. Upon termination, your clipboard data stored on our servers will be deleted.</p>
          </Section>

          <Section title="11. Disclaimer of Warranties">
            <p>The Service is provided "as is" and "as available" without warranties of any kind, express or implied. We do not warrant that the Service will be error-free, secure, or uninterrupted. We disclaim all implied warranties including merchantability, fitness for a particular purpose, and non-infringement.</p>
          </Section>

          <Section title="12. Limitation of Liability">
            <p>To the maximum extent permitted by law, Extory shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data arising from your use of the Service. Our total liability for any claim arising from the Service shall not exceed the amount you paid us in the 12 months preceding the claim (or $0 for free accounts).</p>
          </Section>

          <Section title="13. Changes to Terms">
            <p>We may update these Terms from time to time. We will notify users of material changes via email or in-app notification. Continued use of the Service after changes take effect constitutes acceptance of the updated Terms.</p>
          </Section>

          <Section title="14. Governing Law">
            <p>These Terms are governed by the laws of the Republic of Korea, without regard to conflict of law provisions. Any disputes shall be resolved in the courts located in Seoul, Korea.</p>
          </Section>

          <Section title="15. Contact">
            <p>For questions about these Terms, please contact us at: <a href="mailto:support@extory.co" style={s.link}>support@extory.co</a></p>
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
