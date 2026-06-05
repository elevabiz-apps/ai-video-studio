"use client";

// Error boundary de ruta: captura excepciones de SSR/render en cualquier página
// (home, detalle de proyecto, etc.) y muestra un mensaje claro con opción de
// reintentar, en vez del "Application error" blanco con digest críptico.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 40,
        gap: 12,
      }}
    >
      <div style={{ fontSize: 64 }}>⚠️</div>
      <h2 style={{ fontSize: 22, fontWeight: 800 }}>Algo salió mal</h2>
      <p style={{ fontSize: 14, color: "var(--muted-foreground)", maxWidth: 480 }}>
        Ocurrió un error al cargar esta página. Reintentá; si persiste, avisá al
        equipo.
      </p>
      {error?.message && (
        <p
          style={{
            fontSize: 12,
            color: "var(--muted-foreground)",
            fontFamily: "monospace",
            opacity: 0.75,
            maxWidth: 640,
            wordBreak: "break-word",
          }}
        >
          {error.message}
        </p>
      )}
      <button
        onClick={() => reset()}
        style={{
          marginTop: 12,
          padding: "10px 20px",
          borderRadius: 10,
          border: "1px solid var(--border, rgba(255,255,255,0.15))",
          background: "var(--foreground, #fff)",
          color: "var(--background, #000)",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Reintentar
      </button>
    </div>
  );
}
