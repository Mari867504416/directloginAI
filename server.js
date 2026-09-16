const express = require("express");
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const app = express();

const PORT = process.env.PORT || 10000;

// Persistent browser profile
const USER_DATA_DIR = path.join(
    __dirname,
    "auth",
    "user-data"
);

// Gemini URL
const GEMINI_URL = "https://gemini.google.com/app";

// Global browser context/page
let browserContext = null;
let geminiPage = null;
let browserStarting = null;

// Prevent simultaneous questions
let requestRunning = false;


/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(express.json({
    limit: "2mb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "2mb"
}));

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


/* =========================================================
   CREATE USER DATA DIRECTORY
========================================================= */

function ensureUserDataDirectory() {

    if (!fs.existsSync(USER_DATA_DIR)) {

        fs.mkdirSync(
            USER_DATA_DIR,
            {
                recursive: true
            }
        );
    }
}


/* =========================================================
   START GEMINI BROWSER
========================================================= */

async function startGeminiBrowser() {

    // Browser already running
    if (
        geminiPage &&
        !geminiPage.isClosed()
    ) {

        return geminiPage;
    }


    // Another request is already starting browser
    if (browserStarting) {

        return await browserStarting;
    }


    browserStarting = (async () => {

        try {

            console.log("================================");
            console.log("Starting Chromium...");
            console.log("================================");


            ensureUserDataDirectory();


            /*
             * Persistent context is used so that
             * Google/Gemini session can remain available.
             */

            browserContext =
                await chromium.launchPersistentContext(
                    USER_DATA_DIR,
                    {

                        headless: true,

                        viewport: {
                            width: 1440,
                            height: 900
                        },

                        args: [

                            "--no-sandbox",

                            "--disable-setuid-sandbox",

                            "--disable-dev-shm-usage",

                            "--disable-gpu",

                            "--disable-software-rasterizer",

                            "--no-first-run",

                            "--no-default-browser-check"

                        ]

                    }
                );


            /*
             * Use existing page if available
             */

            const pages =
                browserContext.pages();


            if (pages.length > 0) {

                geminiPage =
                    pages[0];

            } else {

                geminiPage =
                    await browserContext.newPage();

            }


            /*
             * Browser crash handling
             */

            geminiPage.on(
                "close",
                () => {

                    console.log(
                        "Gemini page closed."
                    );

                    geminiPage = null;
                }
            );


            /*
             * Open Gemini
             */

            console.log(
                "Opening Gemini..."
            );


            await geminiPage.goto(
                GEMINI_URL,
                {
                    waitUntil:
                        "domcontentloaded",

                    timeout:
                        120000
                }
            );


            await geminiPage.waitForTimeout(
                3000
            );


            console.log(
                "Gemini URL:",
                geminiPage.url()
            );


            console.log(
                "Gemini title:",
                await geminiPage.title()
                    .catch(() => "")
            );


            return geminiPage;


        } catch (error) {

            console.error(
                "Browser startup error:",
                error
            );

            geminiPage = null;

            if (browserContext) {

                await browserContext.close()
                    .catch(() => {});

                browserContext = null;
            }

            throw error;

        }

    })();


    try {

        return await browserStarting;

    } finally {

        browserStarting = null;
    }
}


/* =========================================================
   CHECK GOOGLE LOGIN
========================================================= */

async function checkGeminiLogin(page) {

    const url =
        page.url();


    /*
     * Google login page
     */

    if (
        url.includes(
            "accounts.google.com"
        )
    ) {

        return false;
    }


    /*
     * Common login input
     */

    const emailInput =
        page.locator(
            'input[type="email"]'
        );


    if (
        await emailInput.count() > 0
    ) {

        if (
            await emailInput
                .first()
                .isVisible()
                .catch(() => false)
        ) {

            return false;
        }
    }


    /*
     * Gemini page itself
     */

    if (
        url.includes(
            "gemini.google.com"
        )
    ) {

        return true;
    }


    return false;
}


/* =========================================================
   FIND GEMINI INPUT
========================================================= */

async function findGeminiInput(page) {

    const selectors = [

        "textarea",

        'div[role="textbox"]',

        '[contenteditable="true"]',

        'rich-textarea textarea',

        'rich-textarea',

        'div[contenteditable="true"][role="textbox"]'

    ];


    for (
        const selector of selectors
    ) {

        const locator =
            page.locator(selector).last();


        if (
            await locator.count() === 0
        ) {

            continue;
        }


        if (
            await locator
                .isVisible()
                .catch(() => false)
        ) {

            console.log(
                "Gemini input found:",
                selector
            );

            return locator;
        }
    }


    return null;
}


/* =========================================================
   FIND SEND BUTTON
========================================================= */

async function findSendButton(page) {

    const selectors = [

        'button[aria-label*="Send"]',

        'button[aria-label*="send"]',

        'button[data-testid*="send"]',

        '[data-testid*="send-button"]',

        'button:has-text("Send")'

    ];


    for (
        const selector of selectors
    ) {

        const locator =
            page.locator(selector).last();


        if (
            await locator.count() === 0
        ) {

            continue;
        }


        if (
            await locator
                .isVisible()
                .catch(() => false)
        ) {

            return locator;
        }
    }


    return null;
}


/* =========================================================
   GET RESPONSE TEXT
========================================================= */

async function getGeminiResponse(page) {

    /*
     * Possible Gemini response selectors.
     * Google can change the DOM, so several selectors
     * are checked.
     */

    const selectors = [

        "message-content",

        ".model-response-text",

        "[data-message-author-role='model']",

        ".markdown-main-panel",

        "model-response",

        "div[class*='model-response']",

        "div[class*='response-content']"

    ];


    let bestText = "";


    for (
        const selector of selectors
    ) {

        const locator =
            page.locator(selector);


        const count =
            await locator.count();


        if (count === 0) {

            continue;
        }


        for (
            let i = count - 1;
            i >= 0;
            i--
        ) {

            const element =
                locator.nth(i);


            if (
                !await element
                    .isVisible()
                    .catch(() => false)
            ) {

                continue;
            }


            const text =
                await element
                    .innerText()
                    .catch(() => "");


            if (
                text &&
                text.trim().length > bestText.length
            ) {

                bestText =
                    text.trim();
            }


            if (
                bestText.length > 20
            ) {

                return bestText;
            }
        }
    }


    return bestText;
}


/* =========================================================
   WAIT FOR GEMINI RESPONSE
========================================================= */

async function waitForGeminiResponse(
    page,
    previousText
) {

    let stableText = "";

    let stableCount = 0;


    for (
        let attempt = 0;
        attempt < 60;
        attempt++
    ) {

        await page.waitForTimeout(
            1000
        );


        const currentText =
            await getGeminiResponse(
                page
            );


        if (
            currentText &&
            currentText !== previousText
        ) {

            /*
             * Gemini may stream its response.
             * Wait until the text becomes stable.
             */

            if (
                currentText === stableText
            ) {

                stableCount++;

            } else {

                stableText =
                    currentText;

                stableCount = 0;
            }


            /*
             * Response unchanged for 2 seconds
             */

            if (
                stableCount >= 2
            ) {

                return currentText;
            }
        }
    }


    return stableText;
}


/* =========================================================
   STATUS
========================================================= */

app.get(
    "/gemini-status",
    async (req, res) => {

        try {

            const page =
                await startGeminiBrowser();


            const loggedIn =
                await checkGeminiLogin(
                    page
                );


            res.json({

                success: true,

                loggedIn,

                url: page.url(),

                title:
                    await page.title()
                        .catch(() => "")

            });


        } catch (error) {

            console.error(
                "Status error:",
                error
            );


            res.status(500).json({

                success: false,

                error:
                    error.message

            });
        }
    }
);


/* =========================================================
   ASK GEMINI
========================================================= */

app.post(
    "/ask",
    async (req, res) => {

        if (requestRunning) {

            return res.status(429).json({

                success: false,

                error:
                    "Another Gemini request is already running. Please wait."

            });
        }


        requestRunning = true;


        try {

            const question =
                String(
                    req.body.question || ""
                ).trim();


            if (!question) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Question is required."

                });
            }


            console.log("");
            console.log(
                "================================"
            );
            console.log(
                "Question:",
                question
            );
            console.log(
                "================================"
            );


            const page =
                await startGeminiBrowser();


            /* -----------------------------------------
               CHECK LOGIN
            ----------------------------------------- */

            const loggedIn =
                await checkGeminiLogin(
                    page
                );


            if (!loggedIn) {

                console.log(
                    "Gemini login is required."
                );


                return res.status(401).json({

                    success: false,

                    loginRequired: true,

                    error:
                        "Google login is required for Gemini Web."

                });
            }


            /* -----------------------------------------
               MAKE SURE GEMINI PAGE IS OPEN
            ----------------------------------------- */

            if (
                !page.url().includes(
                    "gemini.google.com"
                )
            ) {

                await page.goto(
                    GEMINI_URL,
                    {
                        waitUntil:
                            "domcontentloaded",

                        timeout:
                            120000
                    }
                );


                await page.waitForTimeout(
                    3000
                );
            }


            /* -----------------------------------------
               FIND INPUT
            ----------------------------------------- */

            const input =
                await findGeminiInput(
                    page
                );


            if (!input) {

                return res.status(500).json({

                    success: false,

                    error:
                        "Gemini input box was not found. Google may have changed the Gemini Web UI."

                });
            }


            /* -----------------------------------------
               GET CURRENT RESPONSE
            ----------------------------------------- */

            const previousResponse =
                await getGeminiResponse(
                    page
                );


            /* -----------------------------------------
               ENTER QUESTION
            ----------------------------------------- */

            await input.click();


            await input.fill(
                question
            );


            console.log(
                "Question entered."
            );


            /* -----------------------------------------
               SEND
            ----------------------------------------- */

            const sendButton =
                await findSendButton(
                    page
                );


            if (sendButton) {

                await sendButton.click();


                console.log(
                    "Send button clicked."
                );

            } else {

                console.log(
                    "Send button not found."
                );

                console.log(
                    "Trying Enter..."
                );


                await input.press(
                    "Enter"
                );
            }


            /* -----------------------------------------
               WAIT
            ----------------------------------------- */

            console.log(
                "Waiting for Gemini response..."
            );


            const answer =
                await waitForGeminiResponse(
                    page,
                    previousResponse
                );


            /* -----------------------------------------
               CHECK ANSWER
            ----------------------------------------- */

            if (
                !answer ||
                answer.trim().length < 2
            ) {

                return res.status(500).json({

                    success: false,

                    error:
                        "Gemini response could not be extracted from the Web UI."

                });
            }


            console.log("");
            console.log(
                "Gemini Answer:"
            );
            console.log(
                answer
            );
            console.log("");


            /* -----------------------------------------
               RETURN FRONTEND RESPONSE
            ----------------------------------------- */

            res.json({

                success: true,

                question,

                answer,

                timestamp:
                    new Date().toISOString()

            });


        } catch (error) {

            console.error(
                "Gemini automation error:"
            );

            console.error(
                error
            );


            res.status(500).json({

                success: false,

                error:
                    error.message

            });


        } finally {

            requestRunning = false;
        }
    }
);


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
    "/health",
    (req, res) => {

        res.json({

            status: "ok",

            service:
                "Gemini Web Automation",

            browserRunning:
                !!(
                    geminiPage &&
                    !geminiPage.isClosed()
                ),

            timestamp:
                new Date().toISOString()

        });
    }
);


/* =========================================================
   HOME PAGE
========================================================= */

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    }
);


/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

async function shutdown() {

    console.log(
        "Shutting down..."
    );


    try {

        if (browserContext) {

            await browserContext.close();

        }

    } catch (error) {

        console.error(
            "Browser close error:",
            error.message
        );
    }


    process.exit(0);
}


process.on(
    "SIGTERM",
    shutdown
);

process.on(
    "SIGINT",
    shutdown
);


/* =========================================================
   START SERVER
========================================================= */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");
        console.log(
            "================================"
        );

        console.log(
            `Server running on port ${PORT}`
        );

        console.log(
            `Gemini URL: ${GEMINI_URL}`
        );

        console.log(
            "================================"
        );

    }
);
