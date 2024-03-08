import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import OpenAI from 'openai';
// import readline from 'readline';
import * as dotenv from 'dotenv';
import { waitForEvent, image_to_base64, sleep, highlight_links as highlightLinks, tryParse, askAiForAnswer } from './helpers';

dotenv.config();

puppeteer.use(StealthPlugin());

const openai = new OpenAI();
const timeout = 5000;
const systemMessage = {
    "role": "system",
    "content": `You are a website crawler. You will be given instructions on what to do by browsing. You are connected to a web browser and you will be given the screenshot of the website you are on. The links on the website will be highlighted in red in the screenshot. Always read what is in the screenshot. Don't guess link names.

    You can go to a specific URL by answering with the following JSON format:
    {"url": "url goes here"}

    You can click links on the website by referencing the text inside of the link/button, by answering in the following JSON format:
    {"click": "Text in link"}

    You can scroll down on the website, by answering in the following JSON format:
    {"scroll": "down"}

    Once you are on a URL and you have found the answer to the user's question, you can answer with a regular message.

    Use google search by set a sub-page like 'https://google.com/search?q=search' if applicable. Prefer to use Google for simple queries. If the user provides a direct URL, go to that one. Do not make up links`,
};

// https://github.com/puppeteer/puppeteer/issues/571#issuecomment-325404760
const resolution = 2;

// Goal (G1 & G2): reduce payload size sent to gpt4v

const addScreenshotMessage = async (messages) => {
    const base64_image = await image_to_base64("screenshot.jpg");

    messages.push({
        "role": "user",
        "content": JSON.stringify([
            {
                "type": "image_url",
                "image_url": base64_image,
            },
            {
                "type": "text",
                "text": "Here's the screenshot of the website you are on right now. You can click on links with {\"click\": \"Link text\"} or you can crawl to another URL if this one is incorrect. If you find the answer to the user's question, you can respond normally. If you don't find the answer on this portion of the website, you can scroll down and for another screenshot.",
            }
        ])
    });
}

const handleProcessUrl = async (aiResponse: string) => {
    const resp = tryParse(aiResponse)
    return (resp) ? resp?.url as string : null;
}

const handleClickLink = async (page, aiResponse: string) => {
    const resp = tryParse(aiResponse);
    if (resp) {
        const link = resp.click as string;

        console.log("Clicking on " + link)

        const elements = await page.$$('[gpt-link-text]');

        let partial, exact;

        for (const element of elements) {
            const attributeValue = await element.evaluate(el => el.getAttribute('gpt-link-text'));

            if (attributeValue?.includes(link)) {
                partial = element;
            }

            if (attributeValue === link) {
                exact = element;
            }
        }

        if (exact || partial) {
            const [response] = await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded' })
                    .catch(e => console.log("Navigation timeout/error:", e.message)),
                (exact || partial).click()
            ]);
        }
    }
    throw new Error("Can't find link");
}


const runAgent = async (prompt: string, options?: {}) => {
    console.log("###########################################");
    console.log("# GPT4V-Browsing by Unconventional Coding #");
    console.log("###########################################\n");
    let currentHeight = 0, previousHeight = 0, scrollFactor = 7, screenShotCounter = 0, scrollCounter = 0;
    let agentDone = false, messages = [systemMessage];
    messages.push({
        "role": "user",
        "content": prompt,
    });

    const browser = await puppeteer.launch({
        headless: "new",
        // headless: true,
        ...options,
    });

    const page = await browser.newPage();

    // Listen for the 'console' event on the page
    page.on('console', async (msg) => {
        const msgArgs = msg.args();
        for (let i = 0; i < msgArgs.length; ++i) {
            console.log(await msgArgs[i].jsonValue());
        }
    });

    await page.setViewport({ width: 1200, height: 1200, deviceScaleFactor: resolution, });

    let oldLayout;

    while (!agentDone) {
        // console log current url
        const currentLayout = await page.evaluate(() => {
            return {
                top: window.screenTop, left: window.screenLeft,
                windowH: window.innerHeight, windowW: window.innerWidth,
                totalH: document.body.scrollHeight
            };
        });
        console.log("Current URL:", page.url());
        const totalHeight = await page.evaluate(() => document.body.scrollHeight);

        // ask for answer
        const aiResponse = await askAiForAnswer(openai, messages);
        console.log("AI Response:", aiResponse);

        // responseTypes: click, url, scroll 
        if (aiResponse.includes('scroll')) {
            if (screenShotCounter === scrollFactor) {
                screenShotCounter = 0;
                scrollCounter++;
                previousHeight = currentHeight;
                await page.evaluate(() => window.scrollBy(0, window.innerHeight)); // Scroll down
                await page.waitForTimeout(1000); // Wait for a second to ensure the page has time to scroll
                currentHeight = await page.evaluate((scrollFactor) => window.scrollY + (window.innerHeight / scrollFactor), scrollFactor);

                // if at the bottom of the page & last response was scroll return
                if (currentHeight >= totalHeight) {
                    // throw new Error('No answer found');              
                    agentDone = true;
                }
            }
        }

        if (aiResponse.includes('url')) {
            oldLayout = null;
            previousHeight = 0, currentHeight = 0;
            const url = await handleProcessUrl(aiResponse);
            if (url) {
                console.log("Going to " + url);
                await page.goto(url, {
                    waitUntil: "domcontentloaded",
                    timeout: timeout,
                });

                await Promise.race([
                    waitForEvent(page, 'load'),
                    sleep(timeout)
                ]);
            } else {
                agentDone = true;
            }
        }

        if (aiResponse.includes('click')) {
            oldLayout = null;
            previousHeight = 0, currentHeight = 0;
            try {
                await handleClickLink(page, aiResponse);
            } catch (error) {
                agentDone = true;
                console.log("ERROR: Clicking failed", error);
                messages.push({
                    "role": "assistant", //"user"
                    "content": "ERROR: I was unable to click that element",
                });
            }
        }

        if (agentDone) {
            messages.push({
                "role": "assistant", //"user"
                "content": "ERROR: I was unable to find the answer to your question. Please try asking again or rephrasing your question.",
            });
            continue;
        }

        if (currentHeight == 0) {
            await highlightLinks(page);
        }

        // Handle screenshots
        const screenshotH = currentLayout?.windowH / scrollFactor;
        const clip = {
            // // will capture a 150x100 pixel area starting from the point (50, 100) on the webpage 
            top: currentLayout?.top, // X coordinate of the top-left corner of the area
            left: oldLayout ? oldLayout?.left + screenshotH : currentLayout?.left, // Y coordinate of the top-left corner of the area
            width: currentLayout?.windowW, // Width of the area to capture
            height: screenshotH // Height of the area to capture
        };
        console.log(`Taking screenshot at`, clip);
        console.log(`scrollCounter:${scrollCounter}, screenShotCounter:${screenShotCounter}`);

        await page.screenshot({
            clip: { ...clip, x: clip?.top, y: clip?.left },
            path: "screenshot.jpg",
            quality: 100,
            // fullPage: true,
        });
        await addScreenshotMessage(messages);
        screenShotCounter++;
        if (screenShotCounter !== scrollFactor) {
            oldLayout = clip;
        }
    }
}

export default runAgent;