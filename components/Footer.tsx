import Link from 'next/link';
import { SiteLogo } from '@/components/Logo';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#0F1117] border-t border-[#FF2D95]/10">
      <div className="mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 mb-8">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <SiteLogo />
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              Discover & buy tickets to Lagos&apos;s hottest events.
            </p>
          </div>

          <div>
            <h4 className="font-heading font-bold text-white mb-4 text-sm uppercase tracking-[1px]">Company</h4>
            <ul className="space-y-2.5">
              <li>
                <Link href="/" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/events" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
                  Events
                </Link>
              </li>
              <li>
                <Link href="/#how-it-works" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
                  About us
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-heading font-bold text-white mb-4 text-sm uppercase tracking-[1px]">For organizers</h4>
            <ul className="space-y-2.5">
              <li>
                <Link href="/host/new" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
                  Create event
                </Link>
              </li>
              <li>
                <Link href="/#pricing" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/payouts" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
                  How payouts work
                </Link>
              </li>
              <li>
                <Link href="/host" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
                  Host dashboard
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-heading font-bold text-white mb-4 text-sm uppercase tracking-[1px]">Help and support</h4>
            <ul className="space-y-2.5">
              <li>
                <Link href="/tickets/find" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
                  Find your ticket
                </Link>
              </li>
              <li>
                <Link href="/support" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/refund-policy" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
                  Refund and cancellation policy
                </Link>
              </li>
              <li>
                <Link href="/report-issue" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
                  Report an issue
                </Link>
              </li>
            </ul>
          </div>

          <div className="md:col-span-1">
            <h4 className="font-heading font-bold text-white mb-4 text-sm uppercase tracking-[1px]">Contact</h4>
            <a
              href="mailto:lagosliveticket@gmail.com"
              className="text-gray-400 hover:text-[#00D9FF] transition text-sm block mb-4"
            >
              lagosliveticket@gmail.com
            </a>
            <Link
              href="/support"
              className="inline-block bg-white text-black px-6 py-2 rounded-full font-heading font-bold text-sm hover:bg-gray-100 transition"
            >
              Get in touch
            </Link>

            <h4 className="font-heading font-bold text-white mb-4 mt-6 text-sm uppercase tracking-[1px]">Follow us</h4>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://www.instagram.com/lagosliveticket/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-400 hover:text-[#00D9FF] transition text-sm rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00D9FF]"
                >
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" fill="currentColor" />
                    <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" />
                  </svg>
                  @lagosliveticket
                </a>
              </li>
              <li>
                <a
                  href="https://www.tiktok.com/@lagosliveticket"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-400 hover:text-[#00D9FF] transition text-sm rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00D9FF]"
                >
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                  </svg>
                  @lagosliveticket
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[#FF2D95]/10 pt-8"></div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-xs">
            © {currentYear} — Lagos Live. All Rights Reserved.
          </p>

          <div className="flex items-center gap-6">
            <div className="flex gap-4 text-xs">
              <Link href="/privacy" className="text-gray-500 hover:text-[#00D9FF] transition">
                Privacy
              </Link>
              <Link href="/terms" className="text-gray-500 hover:text-[#00D9FF] transition">
                Terms
              </Link>
              <Link href="/cookies" className="text-gray-500 hover:text-[#00D9FF] transition">
                Cookies
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}