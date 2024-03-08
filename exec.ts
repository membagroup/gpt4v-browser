import agent from './agent';
import { input } from './helpers';

(async () => {
    let looping = true, prompt = 'Go to this url and find me 5 grant makers for charter schools and return their EINs. You may have to around the site to find the answer: https://www.causeiq.com/directory/grants';
    while (looping) {
        if (!prompt) {
            prompt = await input("You: ");
        }
        console.log();
        try {
            await agent(prompt, {
                headless: false,
                executablePath: '/Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary',
                // userDataDir: '/Users/<user>/Library/Application\ Support/Google/Chrome\ Canary/Default',
            });
        } catch (error) {
            console.log(error?.code + ':', error?.message);
            looping = false;
        }
        console.log('Restarting...');
        console.log("GPT: How can I assist you today?")
    }
})();

// Go to this url and find me 5 grant makers for charter schools and return their grant application link: https://www.causeiq.com/directory/grants