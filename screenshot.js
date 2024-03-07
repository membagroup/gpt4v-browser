const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const url = process.argv[2];
const timeout = 5000;

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",        
        // args: [
        //     "--no-sandbox",
        //     "--disable-setuid-sandbox",
        //     "--disable-infobars",
        //     "--window-position=0,0",
        //     "--ignore-certificate-errors",
        //     "--ignore-certificate-errors-spki-list",
        //     "--ignore-ssl-errors",
        //     "--ignore-ssl-errors-exclude-list",
        //     "--enable-features=NetworkService",
        //     "--disable-features=site-per-process",
        //     "--disable-web-security",
        //     "--disable-features=IsolateOrigins,site-per-process",
        //     "--disable-site-isolation-trials",
        //     "--no-zygote",
        //     "--use-gl=swiftshader",
        //     "--disable-gpu",
        //     "--disable-software-rasterizer",
        //     "--disable-dev-shm-usage",
        //     "--disable-accelerated-2d-canvas",
        //     "--no-first-run",
        //     "--single-process",
        // ],
        // executablePath: '/Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary',
        // userDataDir: '/Users/jasonzhou/Library/Application\ Support/Google/Chrome\ Canary/Default',
    });

    const page = await browser.newPage();

    await page.setViewport({
        width: 1200,
        height: 1200,
        deviceScaleFactor: 1,
    });

    await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeout,
    });

    await page.waitForTimeout(timeout);

    await page.screenshot({
        path: "screenshot.jpg",
        fullPage: true,
    });

    await browser.close();
})();