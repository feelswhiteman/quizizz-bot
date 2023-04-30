import puppeteer from "puppeteer";

// quizziz selectors
const leaderboardSelector = '.leaderboard-wrapper';
const powerupSelector = '.powerup-award-container';
const usePowerupButton = '.apply-now';
const continueButton = '.right-navigator';
const submitAnswerButton = '.submit-button';

const redemptionSelector = '.screen-redemption-question-selector';
const redemptionQuestionButton = '.gradient-container';

const levelFeedbackSelector = '.first-level-feedback';
const toSummarySelector = '.skip-summary';
const accuracyInfoSelector = '.accuracy-info-section';


const questionSelector = '#questionText';

const browser = await puppeteer.launch({
    headless: false,
    defaultViewport:
        {
        height: 800,
        width: 1200
    }
});

// quizit selectors
const quizitInputSelector = 'input[type="text"][placeholder="Pin or Link"]';
const quizitGetAnswersButton = 'button[type="button"].bg-blue-500';
const quizitCardSelector = 'div.rounded-xl';

const getAnswersFromQuizit = async (roomCode) => {
    const page = await browser.newPage();
    await page.goto('https://quizit.online/services/quizizz/');

    await page.type(quizitInputSelector, roomCode);
    await page.click(quizitGetAnswersButton);

    await page.waitForSelector(quizitCardSelector);

    return await extractAnswers(page);
};

async function extractAnswers(page) {
    return await page.evaluate(async () => {
        const cards = document.querySelectorAll('div.rounded-xl');

        return Array.from(cards).map((card) => {
            const question = card.querySelector('div.rounded-xl h5').innerText.trim()
                .replace(/\n+/g, ' ')       // Заменяет символы перевода строки на пробел
                .replace(/\s{2,}/g, ' ')    // Удаляет пробел, если встречается 2+ подряд
                .replace(/\u00A0/g, ' ');   // Заменяет неразрывный пробел на обычный (внешне они не отличаются, но для js есть разница)
            const answer = card.querySelector('div.rounded-xl div').innerText.trim()
                .split('\n')
                .filter(str => str !== '');
            return { question, answer };
        });
    });
}

async function inputName(page, name) {
    await page.waitForSelector('.enter-name-field');
    await page.type('.enter-name-field', name);
}

async function configureQuizziz(page) {
    await page.waitForSelector('.toggle-button');
    await page.evaluate(() => {
        const buttons = document.querySelector('.game-settings-list')
            .querySelectorAll('.toggle-button');
        buttons.forEach(button => {
            button.click()
        });
    });
}

async function startGame(page) {
    const buttonSelector1 = '.start-game';
    await page.waitForSelector(buttonSelector1);
    await page.click(buttonSelector1);

    const buttonSelector2 = '.start-btn';
    await page.waitForSelector(buttonSelector2);
    await page.click(buttonSelector2);
}

async function handleAnnoyingPopups(page) {
    if (await page.$(leaderboardSelector)) {
        const button = await page.$(continueButton);
        if (button) {
            await button.click();
        }
        console.log('leaderboard skipped');
    }

    if (await page.$(powerupSelector)) {
        const button = await page.$(continueButton);
        if (button) {
            await button.click();
        }
        console.log('powerup gaining skipped');
    }

    if (await page.$(usePowerupButton)) {
        const button = await page.$(usePowerupButton);
        if (button) {
            await button.click();
        }
        console.log('annoying powerup used');
    }
}

async function handleRedemptionQuestions(page) {
    if (await page.$(redemptionSelector)) {
        const button = await page.$(redemptionQuestionButton);
        if (button) {
            await button.click();
        }
        console.log('redemption question picked');
    }
}

async function extractTextFromElement(page, selector) {
    const element = await page.$(selector);
    if (!element) return '';

    let text = await page.evaluate(el => el.innerText.trim(), element);
    const children = await page.$$(selector + ' > *');
    const childTexts = await Promise.all(children.map(child => extractTextFromElement(page, selector + ' > ' + child.tagName)));

    text = text + childTexts.join('\n').trim();
    text = text
        .replace(/\s{2,}/g, ' ')    // Удаляет пробел, если встречается 2+ подряд
        .replace(/\n+/g, " ")       // Заменяет символы перевода строки на пробел
        .trim();
    return text;
}

async function clickOnCorrectAnswer(page, answers) {
    const question = (await extractTextFromElement(page, questionSelector)).trim();

    await page.waitForSelector('.option.is-mcq');
    let options = await page.$$('.option.is-mcq');
    let found = false;

    console.log('Extracted question: ' + question);

    for (let i = 0; i < answers.length; i++) {
        const card = answers[i];
        if (card.question !== question) continue;

        for(let i = 0; i < options.length; i++) {
            const option = options[i];
            if (!option) return;
            let text;
            try {
                text = await option.$eval('.textContainer', el => el.textContent.trim());
            } catch(error) {
                console.warn('Options with images not supported yet, picking randomly...')
                const optionImage = await page.$('.option-image');
                await optionImage.click();
                return;
            }

            if (card.answer.includes(text)) {
                found = true;
                console.log(`Question = ${card.question}\n Answer = ${card.answer}`);
                await option.click();
            }
        }
    }

    if (!found) {
        console.warn('No answer found! Picking randomly');
        const r = Math.floor(Math.random() * options.length);
        await options[r].click();
        console.log(`Clicked on ${r + 1} card`);
    }

    const button = await page.$(submitAnswerButton);
    if (button) await button.click();
}

const initQuizzizBot = async (name, roomCode, answers) => {
    const page = await browser.newPage();
    await page.goto(`https://quizizz.com/join?gc=${roomCode}`);

    await configureQuizziz(page, name);
    await inputName(page, name);
    // await startGame(page);

    while(true) {

        if (await page.$(levelFeedbackSelector)) {
            const toSummary = await page.$(toSummarySelector);
            if (toSummary) await toSummary.click();
            console.log('skipped level feedback')
            break;
        }

        if(await page.$(accuracyInfoSelector)) {
            console.log('quiz done!')
            break;
        }

        if (await page.$(questionSelector)) {
            await clickOnCorrectAnswer(page, answers);
        }

        await handleAnnoyingPopups(page);
        await handleRedemptionQuestions(page);
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    await page.waitForSelector(accuracyInfoSelector);
    await new Promise(resolve => setTimeout(resolve, 2000));
    // TODO: implement taking screenshots and fix viewport
};

let roomCode = '512452';
let name = 'asd';
let answers = await getAnswersFromQuizit(roomCode);
console.log(answers);
await initQuizzizBot(name, roomCode, answers);
