import Link from 'next/link';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#0F1117] border-t border-[#FF2D95]/10">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 mb-8">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-8 h-8 bg-[#FF2D95] rounded-full text-base">🎉</span>
              <span className="font-heading font-bold text-white">Lagos Live</span>
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
                <Link href="/how-it-works" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
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
                <Link href="/host/pricing" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/host/how-payouts-work" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
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
                <Link href="/faq" className="text-gray-400 hover:text-[#00D9FF] transition text-sm">
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
              href="mailto:hello@lagoslive.ng"
              className="text-gray-400 hover:text-[#00D9FF] transition text-sm block mb-4"
            >
              hello@lagoslive.ng
            </a>
            <Link
              href="/support"
              className="inline-block bg-white text-black px-6 py-2 rounded-full font-heading font-bold text-sm hover:bg-gray-100 transition"
            >
              Get in touch
            </Link>
          </div>
        </div>

        <div className="border-t border-[#FF2D95]/10 pt-8"></div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-xs">
            © {currentYear} — Lagos Live. All Rights Reserved.
          </p>

          <div className="flex items-center gap-6">
            <div className="flex gap-4">
              <a
                href="https://twitter.com/lagosliveng"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-[#FF2D95] transition"
                aria-label="Twitter"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2s9 5 20 5a9.5 9.5 0 00-9-5.5c4.75 2.25 7-7 7-7-2.25 4.5-7 5.5-11 5.5z" />
                </svg>
              </a>
              <a
                href="https://instagram.com/lagosliveng"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-[#FF2D95] transition"
                aria-label="Instagram"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" fill="currentColor" />
                  <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" />
                </svg>
              </a>
              <a
                href="https://facebook.com/lagoslive"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-[#FF2D95] transition"
                aria-label="Facebook"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18 2h-3a6 6 0 0 0-6 6v3H7v4h2v8h4v-8h3l1-4h-4V8a1 1 0 0 1 1-1h3z" />
                </svg>
              </a>
            </div>

            <div className="flex gap-4 text-xs">
              <a href="/privacy" className="text-gray-500 hover:text-[#00D9FF] transition">
                Privacy
              </a>
              <a href="/terms" className="text-gray-500 hover:text-[#00D9FF] transition">
                Terms
              </a>
              <a href="/cookies" className="text-gray-500 hover:text-[#00D9FF] transition">
                Cookies
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}