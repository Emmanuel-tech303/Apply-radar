import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apply Radar — Your job search, in focus",
  description: "Track applications, stay on top of follow-ups, and prepare for your next opportunity.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
