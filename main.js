const { Builder, By, Key, until } = require("selenium-webdriver");
const dateFormat = require("dateformat");
const fs = require("fs");
var smsc = require("./api/smsc_api.js");
const axios = require("axios");
const sleepMs = 8000;
let mode = "development"; // value = "development" or "production"
let site = "GermesClient"; // value = "MercuryClient" or "GermesClient"

smsc.configure({
  login: "",
  password: "",
  //ssl : true/false,
  //charset : 'utf-8',
});
let currentRow = 0;
let errors = 0;
let lastUnique = "";
async function run(setMode, setSite) {
  mode = setMode;
  site = setSite;
  console.log(`Starting with mode: ${mode} site: ${site}`);
  let driver = await new Builder().forBrowser("firefox").build();
  let finished = 0;
  try {
    await getInvocePage(driver);
  } catch (error) {
    fs.appendFileSync(
      `errors_${site}.txt`,
      `${dateFormat(new Date(), "dd-mm-yyyy h:MM:ss")} ${error}\n`
    );
    await getInvocePage(driver, false, false);
  }
  await getIncomingVsdPage(driver);
  do {
    try {
      await getInvocePage(driver, false, false);
      await setTransportId(driver);
      finished = 1;
    } catch (error) {
      fs.appendFileSync(
        `errors_${site}.txt`,
        `${dateFormat(new Date(), "dd-mm-yyyy h:MM:ss")} ${error}\n`
      );
      let msg = encodeURI(
        site == "GermesClient"
          ? "Обнаружена ошибка в гермесе, откройте система и смотрите"
          : "Обнаружена ошибка в регион торге, откройте система и смотрите"
      );
      if (errors) {
        axios.get(
          `https://smsc.ru/sys/send.php?login=37dostavka&psw=&phones=&mes=${msg}&call=1&voice=w`
        );
        await driver.quit();
      }
      errors++;
    }
  } while (!finished);
  console.log("FINISHED!!!");
  //await getAutoPage(driver);
  //console.log("Driver sleeping 1.5 hour");
  //await driverSleep(driver, 60000 * 60 * 1.5);
  //await getAutoPage(driver);
  await driver.quit();
}
async function setTransportId(driver) {
  const dataLenght = await driver.executeScript(
    `return document.getElementsByClassName('mat-row').length`
  );
  for (i = 0; i < dataLenght * 2; i++) {
    console.log("---------------------");
    console.log(`Step ${i} and currentRow ${currentRow}`);
    const rowColor = await getRowColor(driver, currentRow);
    console.log(`Row color: ${rowColor}`);
    if (rowColor == "" || rowColor == "red") {
      const fullText = await driver.executeScript(
        `return document.getElementsByClassName('mat-row')[` +
          currentRow +
          `].getElementsByClassName('mat-cell')[4].textContent`
      );
      const currentUnique = await driver.executeScript(
        `return document.getElementsByClassName('mat-row')[` +
          currentRow +
          `].getElementsByClassName('mat-cell')[2].textContent`
      );
      console.log(`Full text: ${fullText}`);
      const transportId = getTransportId(fullText);
      console.log(`TransportId: ${transportId}`);
      console.log(
        `***lastUnique: ${lastUnique} currentUnique: ${currentUnique}***`
      );
      if (lastUnique == currentUnique) {
        await getInvocePage(driver, true, true, true);
        await driverSleep(driver, sleepMs * 3);
      }

      await driver.executeScript(
        `document.getElementsByClassName('mat-row')[` +
          currentRow +
          `].click();`
      );
      await driverSleep(driver, sleepMs);
      const rowLength = await driver.executeScript(`
        let detailsLength = document.getElementsByClassName('mat-row').length;
        let greenRowLength = 0;
        let redRowLength = 0;
        for(i=0;i<detailsLength;i++){
          if(document.getElementsByClassName('mat-row')[i].style.backgroundColor == "rgb(154, 205, 50)")
            greenRowLength++;
          else if(document.getElementsByClassName('mat-row')[i].style.backgroundColor == "red")
            redRowLength++;
        }
        return {detailsLength, greenRowLength, redRowLength};
     `);
      console.log(
        `all: ${rowLength.detailsLength} green: ${rowLength.greenRowLength} red: ${rowLength.redRowLength}`
      );
      if (rowLength.redRowLength != 0) {
        currentRow++;
        await getInvocePage(driver, true, false);
        await driverSleep(driver, sleepMs * 3);
        continue;
      }
      await clickButtonXpath(
        driver,
        "/html/body/app/ng-component/div/div[3]/div/button"
      );
      await driverSleep(driver, sleepMs / 4);

      if (rowLength.detailsLength != rowLength.greenRowLength) {
        await driver.executeScript(`
        function getElementByXpath(path) {
          return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        }
        getElementByXpath('/html/body/div[2]/div[2]/div/mat-dialog-container/dialog-elemetns-dialog/div[2]/button[2]').click();
      `);
      }
      await driverSleep(driver, sleepMs / 2);
      if (transportId) {
        await setInputData(driver, "mat-input-8", transportId);
      }
      await driverSleep(driver, sleepMs);
      if (checkMode()) {
        // if "production" run
        await clickButtonXpath(
          driver,
          "/html/body/app/ng-component/div/div/div[3]/div/mat-grid-list/div/mat-grid-tile[2]/figure/button"
        );
        console.log(`${transportId} Updated Form`);
      }
      if (lastUnique == currentUnique) {
        currentRow++;
        await getInvocePage(driver, false, false);
        await driverSleep(driver, sleepMs * 3);
        continue;
      }
      await driverSleep(driver, sleepMs * 2);
      await getInvocePage(driver, false, false);
      await driverSleep(driver, sleepMs * 3);
      lastUnique = currentUnique;
    } else return 1;
  }
}

async function getAutoPage(driver) {
  const currentDate = dateFormat(new Date(), "mm/dd/yyyy");
  await driver.get(`http://192.168.96.100/${site}/Auto`);
  console.log("getpage Auto");
  await driverSleep(driver, sleepMs);
  await setInputData(driver, "mat-input-0", currentDate);
  await setInputData(driver, "mat-input-1", currentDate);
  await driverSleep(driver, sleepMs);
  await clickButtonXpath(
    driver,
    "/html/body/app/auto-vet-document/div/div[1]/div[4]/button"
  ); //Opened Popup
  console.log("Opened Popup");
  await driverSleep(driver, sleepMs);
  if (checkMode()) {
    //if "production" run
    await clickButtonXpath(
      driver,
      "/html/body/div[1]/div[2]/div/mat-dialog-container/ng-component/div[2]/mat-dialog-actions/button"
    ); //AutoPage Completed
    console.log("AutoPage Completed");
  }
}

async function getInvocePage(
  driver,
  clearCache = true,
  clearMercury = true,
  reload = false
) {
  const currentDate = dateFormat(new Date(), "mm/dd/yyyy");

  await driver.get(`http://192.168.96.100/${site}`);
  console.log("getpage Invoce");
  await driverSleep(driver, sleepMs);
  if (clearCache) {
    await clickButtonXpath(
      driver,
      "/html/body/app/invoices/div[2]/div/div[2]/div[1]/button"
    ); //cleand cache
    await driverSleep(driver, sleepMs);
    console.log("Cleaned Cache");
  }

  if (clearMercury) {
    await clickButtonXpath(
      driver,
      "/html/body/app/invoices/div[2]/div/div[2]/div[2]/button"
    ); //cleand cache
    await driverSleep(driver, sleepMs);
    console.log("Cleaned Mercury");
  }
  if (reload) await driver.get(`http://192.168.96.100/${site}`);

  await setInputData(driver, "mat-input-0", currentDate);
  await setInputData(driver, "mat-input-1", currentDate);
  await driverSleep(driver, sleepMs / 4);
  await clickButtonXpath(
    driver,
    "/html/body/app/invoices/div[2]/div/div[3]/div[6]/button"
  ); //searched data
  console.log("Searched Data");
  await driverSleep(driver, 10000);
}

async function getIncomingVsdPage(driver) {
  const currentDate = dateFormat(new Date(), "mm/dd/yyyy");

  await driver.get(`http://192.168.96.100/${site}/IncomingVSD`);
  console.log("getpage IncomingVSD");
  await driverSleep(driver, sleepMs);
  await setInputData(driver, "mat-input-0", currentDate);
  await setInputData(driver, "mat-input-1", currentDate);
  await driverSleep(driver, sleepMs);
  await clickButtonXpath(
    driver,
    "/html/body/app/incoming-vsd/div[1]/div[7]/button"
  ); //searched data IncomingVSD
  await driverSleep(driver, 20000 * 1);
  await driver.executeScript(`
    const checkboxLenght = document.getElementsByClassName('mat-checkbox-input').length;
    for(i=2; i<checkboxLenght+1; i++){
    document.getElementById("mat-checkbox-"+i+"-input").click();
	document.getElementById("mat-checkbox-"+i+"").click();
    }
    `);
  await driverSleep(driver, sleepMs);
  console.log("End Wait Time");
  if (checkMode()) {
    //if "production" run
    await driver.executeScript(`
    function getElementByXpath(path) {
      return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }
    getElementByXpath('/html/body/app/incoming-vsd/div[2]/div[1]/button').click();
    `);
    console.log("Sent Incoming Vsd");
    await driverSleep(driver, 60000 * 30);
  }
}

async function setInputData(driver, elemId, text) {
  await clearInputText(driver, elemId);
  await driverSleep(driver, 1000);
  await driver.findElement(By.id(elemId)).sendKeys(text);
}

async function clearInputText(driver, elemId) {
  await driver.findElement(By.id(elemId)).sendKeys(Key.CONTROL, Key.chord("a"));
  await driver.findElement(By.id(elemId)).sendKeys(Key.BACK_SPACE);
}

async function clickButtonXpath(driver, xpath) {
  await driver.wait(until.elementLocated(By.xpath(xpath)), 1000).click();
}

async function clickButtonId(driver, id) {
  await driver.wait(until.elementLocated(By.id(id)), 1000).click();
}

async function getRowColor(driver, row) {
  return await driver.executeScript(
    `return document.getElementsByClassName('mat-row')[` +
      row +
      `].style.backgroundColor`
  );
}

async function driverSleep(driver, sleepTime) {
  await driver.sleep(sleepTime);
}

function checkMode() {
  if (mode == "production") return true;
  return false;
}

function getTransportId(fullText) {
  switch (true) {
    case fullText.includes("г.Кинешма"):
      return "";
      break;
    case fullText.includes("г.Вичуга"):
      return "";
      break;
    case fullText.includes("г.Родники"):
      return "";
      break;
    case fullText.includes("г.Заволжск"):
      return "";
      break;
    case fullText.includes("г.Наволоки"):
      return "";
      break;
    case fullText.includes("г.Москва"):
      return "";
      break;
    case fullText.includes("г.Чебоксары"):
      return "";
      break;
    case fullText.includes("г.Казань"):
      return "";
      break;
    case fullText.includes("г.Цивильск"):
      return "";
      break;
    case fullText.includes("г.Йошкар-Ола"):
      return "";
      break;
    case fullText.includes("г.Нижний Новгород"):
      return "";
      break;
    case fullText.includes("г.Рязань"):
      return "";
      break;
    case fullText.includes("г.Ярославль"):
      return "";
      break;
    case fullText.includes("г.Гаврилов-Ям"):
      return "";
      break;
    case fullText.includes("с.Писцово"):
      return "";
      break;
    case fullText.includes("г.Рыбинск"):
      return "";
      break;
    case fullText.includes("г.Киров"):
      return "";
      break;
    case fullText.includes("г.Тейково"):
      return "";
      break;
    case fullText.includes("г.Шуя"):
      return "";
      break;
    case fullText.includes("г.Кохма"):
      return "";
      break;
    case fullText.includes("г.Приволжск"):
      return "";
      break;
    case fullText.includes("г.Фурманов"):
      return "";
      break;
    case fullText.includes("г.Кострома"):
      return "";
      break;
    case fullText.includes("г.Волгореченск"):
      return "";
      break;
    case fullText.includes("г.Тюмень"):
      return "";
      break;
    case fullText.includes("г.Тверь"):
      return "";
      break;
    case fullText.includes("г.Ростов на дону"):
      return "";
      break;
    case fullText.includes("Краснодарский край"):
      return "";
      break;
    case fullText.includes("Ивановская обл.Ивановский р-н, п/о Озерное"):
      return "";
      break;
    case fullText.includes("Свердловская обл.г.Екатеринбург"):
      return "";
      break;
    case fullText.includes("Нижегородская обл.г.Дзержинск"):
      return "";
      break;
    case fullText.includes("Ивановская обл.д.Сабиново"):
      return "";
      break;
    case fullText.includes("Ивановская обл.пос.Старая Вичуга"):
      return "";
      break;
    case fullText.includes("Ивановская обл.д.Курилиха"):
      return "";
      break;
    case fullText.includes("Ивановская обл.с.Бибирево"):
      return "";
      break;
    case fullText.includes("Ярославская обл.пос.Красные Ткачи"):
      return "";
      break;
    case fullText.includes("Ярославская обл.пос.Ярославский р-н"):
      return "";
      break;
	case fullText.includes("Ивановская обл.с.Михалево"):
      return "";
      break;
	case fullText.includes("Костромская обл.г.Шарья"):
      return "";
      break;

    default:
      return false;
      break;
  }
}

module.exports.run = run;
