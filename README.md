Onboardin PWA



Repository: https://github.com/onboardinllc/onboardin.git

Production URL: https://onboardin.llc



Project Overview



Onboardin is a Progressive Web App (PWA) designed as a Business Development Automation Suite. It features a cinematic, high-performance landing page for public users and a lazy-loaded, secure dashboard for registered clients.



Architecture: The "Powerhouse" Split



To maintain 100/100 Lighthouse performance scores while offering complex tools, the app uses Route-Based Code Splitting:



Public Bundle (Landing):



Lightweight: Loads instantly.



Features: Green Screen Video Engine (Canvas), Auth Login, Brand Kit.



Assets: Onboardin-Ongreen.mp4 (Auto-keyed), Onboardin.png.



Admin Bundle (Dashboard):



Lazy Loaded: Only fetched after successful login.



Features: Wave Accounting, Numeral Tax, Resend Emailing, AI Agent Config.



Security: Admin logic is isolated from the public entry point.



Tech Stack



Core: Vite + Preact (React alternative, 3kb size)



Styling: Tailwind CSS + Phosphor Icons



State: Signals (Preact)



PWA: Service Worker (Offline caching) + Manifest



Development Setup



1\. Prerequisites



Ensure you have Node.js installed on your computer.



2\. Initialization



git clone \[https://github.com/onboardinllc/onboardin.git](https://github.com/onboardinllc/onboardin.git)

cd onboardin

npm install





3\. Start Local Server



npm run dev





Project Structure



/public

&nbsp; ├── manifest.json       # PWA Install Config

&nbsp; ├── sw.js               # Service Worker

&nbsp; ├── Onboardin.png       # Logo

&nbsp; └── Onboardin-Ongreen.mp4 # Intro Video

/src

&nbsp; ├── /pages

&nbsp; │   ├── Landing.jsx     # Public Marketing Page

&nbsp; │   └── /dashboard      # Protected Admin Routes

&nbsp; ├── /features

&nbsp; │   └── GreenScreen.jsx # Chroma Key Logic

&nbsp; ├── main.jsx            # Entry Point

&nbsp; └── index.css           # Global Styles \& Waves

vite.config.js            # Asset Pathing \& CORS Config

postcss.config.js         # Tailwind Processor

tailwind.config.js        # UI Tokens

LICENSE                   # MIT License





License



This project is licensed under the MIT License - see the LICENSE file for details.

