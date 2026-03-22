import Image from "next/image";
export const metadata = {
  title: "ThoughtField",
  description: "Seed any text. Watch 25 living agents simulate a world. Predict what happens next.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: "#0f0f14" }}>
        {children}
      </body>
    </html>
  );
}