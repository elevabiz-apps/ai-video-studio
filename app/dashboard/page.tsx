"use client";

// TODO: Complex dashboard temporarily simplified due to build hang investigation
// Original 823-line component is causing the Next.js build to hang during "Collecting build traces"
// This minimal version allows the build to complete

export default function DashboardPage() {
  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>
        Automatización
      </h1>
      <p style={{ color: "var(--muted-foreground)", marginBottom: 24 }}>
        Pipeline automático: Google Drive → Procesar → Aprobar → Publicar
      </p>

      <div style={{
        background: "var(--card)",
        padding: 24,
        borderRadius: 8,
        border: "1px solid var(--border)",
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
          Dashboard (en mantenimiento)
        </h2>
        <p style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
          El dashboard completo está en proceso de optimización.
          Por ahora, puedes:
        </p>
        <ul style={{ marginTop: 16, paddingLeft: 20, color: "var(--muted-foreground)" }}>
          <li>Gestionar configuraciones de automatización en /api/auto-config</li>
          <li>Ver sincronización de Drive en /api/drive-sync</li>
          <li>Configurar perfiles de contenido en /api/references</li>
          <li>Revisar métricas en /api/dashboard/analytics</li>
        </ul>
      </div>

      <a
        href="/dashboard/analytics"
        style={{
          display: "inline-block",
          marginTop: 24,
          padding: "8px 16px",
          background: "var(--accent)",
          color: "white",
          textDecoration: "none",
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        📊 Ver Analytics
      </a>
    </div>
  );
}
