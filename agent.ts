import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import OpenAI from 'openai';
// import readline from 'readline';
import * as dotenv from 'dotenv';
import { waitForEvent, image_to_base64, sleep, highlight_links } from './helpers';

dotenv.config();

puppeteer.use(StealthPlugin());

const openai = new OpenAI();
const timeout = 5000;
const messages = [
    {
        "role": "system",
        "content": `You are a website crawler. You will be given instructions on what to do by browsing. You are connected to a web browser and you will be given the screenshot of the website you are on. The links on the website will be highlighted in red in the screenshot. Always read what is in the screenshot. Don't guess link names.

        You can go to a specific URL by answering with the following JSON format:
        {"url": "url goes here"}

        You can click links on the website by referencing the text inside of the link/button, by answering in the following JSON format:
        {"click": "Text in link"}

        Once you are on a URL and you have found the answer to the user's question, you can answer with a regular message.

        Use google search by set a sub-page like 'https://google.com/search?q=search' if applicable. Prefer to use Google for simple queries. If the user provides a direct URL, go to that one. Do not make up links`,
    }
];


const highlight_screenshot = async (page, prompt: string, url?: string, goTo = false) => {
    let elemId;

    // take screen shot of viewport
    // see if screenshot answers the question

    // if not then scroll down and take another screenshot
    // see if screenshot answers the question

    // if not then scroll down and take another screenshot
    // see if screenshot answers the question

    // if at the bottom of the page return



    // Listen for the 'console' event on the page
    page.on('console', async (msg) => {
        const msgArgs = msg.args();
        for (let i = 0; i < msgArgs.length; ++i) {
            console.log(await msgArgs[i].jsonValue());
        }
    });

    if (goTo) {
        console.log("Crawling " + url);
        await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: timeout,
        });
    }
    await Promise.race([
        waitForEvent(page, 'load'),
        sleep(timeout)
    ]);

    // // Iterate over the words two at a time
    // for (let i = 0; i < words.length; i += 2) {
    //     const textToFind = words.slice(i, i + 2).join(' ');

    //     // Use Puppeteer to find elements containing the pair of words
    //     const elements = await page.$x(`//*[contains(text(), "${textToFind}")]`);

    //     if (elements.length > 0) {
    //         console.log(`Found element(s) containing "${textToFind}":`, elements.length);
    //         // You can perform further actions with the found elements here
    //         elemId = await page.evaluate((el) => el.id, elements[0]);
    //     } else {
    //         console.log(`No elements found containing "${textToFind}"`);
    //     }
    // }

    // const grantLinks = await page.$$eval('a', links => links.map(link => link)) as NodeListOf<HTMLAnchorElement>;
    // const grantLinks = await page.$$eval('a', links => links.map(link => link.href));
    // find link with text
    // get link element id
    // const link = await page.evaluate(async (text) => {
    //     const words = text.split(' ');
    //     const grantLinks = await document.querySelectorAll('a');
    //     console.log("Links:", prompt, words, grantLinks);
    //     for (let l of grantLinks) {
    //         // if (text.split(' ').some(word => elements[i].innerText.includes(word))) {
    //         //     return elements[i]?.id;
    //         // }
    //         for (let i = 0; i < words.length; i += 2) {
    //             const textToFind = words?.slice(i, i + 2).join(' ');
    //             if (l?.textContent.includes(textToFind)) {
    //                 // if (l?.textContent?.includes(textToFind)) {
    //                 return l?.id;
    //             }
    //         }
    //     }
    // }, prompt);

     // Perform the evaluation and wait for it to complete
     const results = await page.evaluate((prompt) => {
        const words = prompt.split(' ');
        const grantLinks = Array.from(document.querySelectorAll('a'));
        console.log("Links:", prompt, words, grantLinks[0]?.innerText);

        let foundLinks = [];
        for (let i = 0; i < words.length; i += 2) {
            const textToFind = words.slice(i, i + 2).join(' ');
            for (let link of grantLinks) {
                if (link.innerText.includes(textToFind)) {
                    foundLinks.push(link.id);
                }
            }
        }
        // Return the found links or any other result you need
        return foundLinks;
    }, prompt);


    elemId = results[0].id;

    console.log("Link Id:", elemId, results[0]);

    await highlight_links(page);

    if (!elemId) {
        // TODO: clip page from element
        await page.screenshot({
            // // will capture a 150x100 pixel area starting from the point (50, 100) on the webpage 
            clip: {
                x: 50, // X coordinate of the top-left corner of the area
                y: 100, // Y coordinate of the top-left corner of the area
                width: 150, // Width of the area to capture
                height: 100 // Height of the area to capture
            },
            path: "screenshot.jpg",
            quality: 100,
            // fullPage: true,
        });
    } else {
        // Replace '#elementId' with the selector of the element you want to scroll to
        await page.waitForSelector(elemId);

        // Scroll to the element
        await page.evaluate(() => {
            document.querySelector('#elementId').scrollIntoView();
        });

        // Optionally, wait for a bit to ensure the page has time to scroll
        await page.waitForTimeout(1000); // Wait for 1 second

        // const element = await page.$('#unique-element-id');
        const element = await page.$(elemId);
        await element.screenshot({
            path: "screenshot.jpg",
            quality: 100,
        });
    }
};

const runAgent = async (prompt: string, options?: {}) => {
    console.log("###########################################");
    console.log("# GPT4V-Browsing by Unconventional Coding #");
    console.log("###########################################\n");

    const browser = await puppeteer.launch({
        // headless: "new",
        headless: false,
        ...options,
        // executablePath: '/Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary',
        // userDataDir: '/Users/<user>/Library/Application\ Support/Google/Chrome\ Canary/Default',
    });

    const page = await browser.newPage();

    await page.setViewport({
        width: 1200,
        height: 1200,
        deviceScaleFactor: 1,
    });

    messages.push({
        "role": "user",
        "content": prompt,
    });

    let url, screenshot_taken = false, agent_done = false;

    while (!agent_done) {
        if (url) {
            await highlight_screenshot(page, prompt, url, true);
            screenshot_taken = true;
            url = null;
        }

        if (screenshot_taken) {
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
                        "text": "Here's the screenshot of the website you are on right now. You can click on links with {\"click\": \"Link text\"} or you can crawl to another URL if this one is incorrect. If you find the answer to the user's question, you can respond normally.",
                    }
                ])
            });

            screenshot_taken = false;
        }

        // https://platform.openai.com/account/limits
        const response = await openai.chat.completions.create({
            model: "gpt-4-vision-preview",
            max_tokens: 1024,
            // max_tokens: 100, //model's response will be limited to 100 tokens.
            messages: messages as any[],
        });

        const message = response.choices[0].message;
        const message_text = message.content.trim();

        messages.push({
            "role": "assistant",
            "content": message_text,
        });

        // console.log("GPT: " + message_text);
        console.log(JSON.stringify(messages, null, 2));

        if (message_text.includes('click')) {

            // let parts = message_text.split('{"click": "');
            // parts = parts[1].split('"}');
            // const link_text = parts[0].replace(/[^a-zA-Z0-9 ]/g, '');
            const link_text = JSON.parse(message_text).click;

            console.log("Clicking on " + link_text)

            try {
                const elements = await page.$$('[gpt-link-text]');

                let partial, exact;

                for (const element of elements) {
                    const attributeValue = await element.evaluate(el => el.getAttribute('gpt-link-text'));

                    if (attributeValue.includes(link_text)) {
                        partial = element;
                    }

                    if (attributeValue === link_text) {
                        exact = element;
                    }
                }

                if (exact || partial) {
                    const [response] = await Promise.all([
                        page.waitForNavigation({ waitUntil: 'domcontentloaded' })
                            .catch(e => console.log("Navigation timeout/error:", e.message)),
                        (exact || partial).click()
                    ]);

                    await highlight_screenshot(page, prompt);

                    // // Additional checks can be done here, like validating the response or URL
                    // await Promise.race([
                    //     waitForEvent(page, 'load'),
                    //     sleep(timeout)
                    // ]);

                    // await highlight_links(page);

                    // await page.screenshot({
                    //     path: "screenshot.jpg",
                    //     quality: 100,
                    //     fullPage: true
                    // });

                    screenshot_taken = true;
                } else {
                    throw new Error("Can't find link");
                }
            } catch (error) {
                console.log("ERROR: Clicking failed", error);

                messages.push({
                    "role": "assistant", //"user"
                    "content": "ERROR: I was unable to click that element",
                });
            }

            continue;
        } else if (message_text.includes('url')) {
            // let parts = message_text.split('{"url": "');
            // parts = parts[1].split('"}');
            // url = parts[0];
            url = JSON.parse(message_text).url;

            continue;
        }

        // const prompt = await input("You: ");
        // console.log();

        // messages.push({
        //     "role": "user",
        //     "content": prompt,
        // });
        agent_done = true;
        prompt = undefined
    }
}

export default runAgent;