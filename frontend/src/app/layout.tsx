import type { Metadata } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { AppNav } from "@/components/AppNav";
import { BrandMark } from "@/components/BrandMark";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Whiskers",
  description:
    "Live cooking with Whisk-Ella: camera on the plate, a whisk of help in your ear.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${fredoka.variable} h-full antialiased`}
    >
      <body className="flex min-h-full font-sans">
        <AppNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-peach/80 bg-cream/90 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-2">
              <BrandMark
                src="/brand/whisk-ella-logo.png"
                alt="Whiskers logo"
                className="h-10 w-10"
              />
              <p className="font-display text-xl text-espresso">Whiskers</p>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
