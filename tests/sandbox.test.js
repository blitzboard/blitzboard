const { Builder, By, Key, until, WebElement} = require('selenium-webdriver')
require('selenium-webdriver/chrome')
require('selenium-webdriver/firefox')
require('chromedriver')
require('geckodriver')

// create test for each browser
const browsers = ['chrome', 'firefox']
browsers.forEach(browser => {
  // open sandbox.html and check
  describe(`Sandbox test for ${browser}`, () => {
    let driver
    beforeEach(async () => {
      driver = await new Builder().forBrowser(browser).build()
      driver.manage().setTimeouts({ implicit: 60000 })
      await driver.get('http://localhost:8081/')
    })
    afterEach(async () => {
      await driver.quit()
    })
    test('should draw relationship graph', async () => {
      await driver.sleep(2000)

      /* getting codemirror element */
      let codeMirror = driver.findElement(By.className("CodeMirror"));

      /* getting the first line of code inside codemirror and clicking it to bring it in focus */
      let codeLine = await codeMirror.findElements(By.className("CodeMirror-lines"))
      codeLine = codeLine[0]
      codeLine.click();

      await driver.actions().keyDown(Key.COMMAND)
        .sendKeys('a').keyUp(Key.COMMAND).sendKeys(Key.BACK_SPACE).perform()

      let textArea = codeMirror.findElement(By.css("textarea"));

      let pg = `
Alice :person age:15
Bob :person age:15

Alice -> Choco :has since:2015
Bob -> Shiro :has since:2017

Choco :dog color:chocolate
Shiro :dog color:silver

Choco -- Shiro :friend since:2018
`;
      textArea.sendKeys(pg)
      await driver.sleep(5000)
    }, 60000)
  })
})