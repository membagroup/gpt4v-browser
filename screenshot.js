const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const url = process.argv[2];
const timeout = 5000;

if (!url) {
    console.error("URL is required");
    process.exit(1);
}

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
        executablePath: '/Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary',
        // userDataDir: '/Users/<user>/Library/Application\ Support/Google/Chrome\ Canary/Default',
    });

    const page = await browser.newPage();

    await page.setViewport({
        width: 1200,
        height: 1200,
        // https://github.com/puppeteer/puppeteer/issues/1329#issuecomment-343088916
        // https://github.com/puppeteer/puppeteer/issues/571
        deviceScaleFactor: 2,
    });

    await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeout,
    });

    await page.waitForTimeout(timeout*2);

    await page.waitForNavigation({ waitUntil: 'domcontentloaded' })
        .catch(e => console.log("Navigation timeout/error:", e.message));

    const size = await page.evaluate(() => {
        return {
            top: window.screenTop, left: window.screenLeft,
            windowH: window.innerHeight, windowW: window.innerWidth,
            totalH: document.body.scrollHeight
        };
    });

    const factor = 7;
    const factorH = size?.windowH / factor;

    await page.screenshot({
        clip: {
            x: size?.top, // X coordinate of the top-left corner of the area
            y: 1221, //size?.left, // Y coordinate of the top-left corner of the area
            width: size?.windowW, // Width of the area to capture
            height: factorH, // Height of the area to capture
        },
        path: "screenshot.jpg",
        type: "jpeg",
        quality: 100,
        // fullPage: true,
    });

    await browser.close();
})();