import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Video Studio",
  description: "Create viral videos with AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body suppressHydrationWarning>
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside
            style={{
              width: 220,
              background: "var(--card)",
              borderRight: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              padding: "24px 0",
              flexShrink: 0,
            }}
          >
            <div style={{ padding: "0 20px 24px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    fontWeight: 800,
                  }}
                >
                  AI
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Video Studio</div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Local</div>
                </div>
              </div>
            </div>

            <nav style={{ padding: "16px 12px", flex: 1 }}>
              <NavLink href="/" label="Proyectos" icon="🎬" />
              <NavLink href="/dashboard" label="Automatización" icon="🤖" />
              <NavLink href="/dashboard/analytics" label="Analytics" icon="📊" />
              <NavLink href="/settings" label="Configuración" icon="⚙️" />
            </nav>

            <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)" }}>
              <a
                href="http://localhost:3000"
                target="_blank"
                style={{
                  fontSize: 12,
                  color: "var(--muted-foreground)",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>↗</span> Remotion Studio
              </a>
            </div>
          </aside>

          {/* Main content */}
          <main style={{ flex: 1, overflow: "auto" }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

function NavLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: string;
}) {
  return (
    <a
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 8,
        textDecoration: "none",
        color: "var(--foreground)",
        fontSize: 14,
        marginBottom: 2,
      }}
    >
      <span>{icon}</span>
      {label}
    </a>
  );
}
