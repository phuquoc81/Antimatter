import "./globals.css";

export const metadata = {
  title: "Antimatter",
  description: "A deployable Antimatter app with a GPT-powered game guide.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
