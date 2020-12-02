const fetch = require('node-fetch');
const { includes, random, sample } = require('lodash');

// API интересных цитат от forismatic.com :
const api = `http://api.forismatic.com/api/1.0/?method=getQuote&format=json&key=${random(1, 999999)}&lang=ru`;

// Определение функции получения данных (API forismatic.com):
async function getData(url) {
  try {
    const data = await fetch(url);
    const json = await data.json();
    let quote = json.quoteText;
    let author = json.quoteAuthor;
    if (author.length < 2)
      author = `${sample([
        'Автор не известен',
        'Авторство не известно',
        'Мыслитель не известен'
      ])}`;
    return `${quote} (${author}). `;
  } catch (err) {
    console.error('Fail to fetch data: ' + err);
    return 'Мысль где-то потеряна! А что, если попробовать ещё раз?';
  }
}

// Слова для определения намерений юзера (интентов):
const playWords = [
  'да', 'слушать', 'хочу', 'хотим', 'жела', 'не против', 'не возражаю', 'соглас',
  'говори', 'расска', 'хорошо', 'продолж', 'дальше', 'далее', 'давай', 'еще', 'ещё',
  'поделись', 'слышать'
];

const helpWords = ['помощ', 'справк', 'умеешь', 'повтор'];

const exitWords = ['не', 'выйти', 'выйди', 'выход', 'закр', 'хватит', 'достаточно', 'заверш'];


module.exports.skill = async (event) => {
  // Парсим запрос от Салюта, и инициализируем основные переменные, которые нам потребуются не 1 раз:
  const body = JSON.parse(event.body);
  const payload = body.payload;
  const device = payload.device;
  
  try {
    // Определяем форму общения - т.е. на "вы" (isOfficial) или на "ты" обращаеется ассистент. 
    // Т.е. это будет Сбер или Афина в первом случае, или Джой - во втором:
    const isOfficial = payload.character.appeal == 'official' ? true : false;

    // В зависимости от формы обращения, импортируем необходимую лексику (с обращением на "вы" или на "ты").
    // А чтобы не делать ещё и разделений на лексику от мужского и женского лица (Сбер и Афина оба используют "вы"),
    // применяются "обтекаемые" выражения. Например, вместо: "Я вас не понял(а)", говорим: "Я вас не понимаю". 
    const lexicon = isOfficial ? require('./src/lexicon-formal') : require('./src/lexicon-unformal');
    
    // Сообщение, которое будет отправлено в смартап (с готовым приветствием как только смартап будет запущен):
    let msg = `${sample(lexicon.hello_1)} ${sample(lexicon.hello_2)} ${sample(lexicon.wish)} ${sample(lexicon.hello_3)}`;
    
    // MESSAGE_TO_SKILL означает, что сообщение будет отправлено в ответ пользователю. Здесь основная логика. 
    if (body.messageName == 'MESSAGE_TO_SKILL') {

      // Получаем фразу пользователя:
      const userUtterance = payload.message.original_text.toLowerCase();

      // Определяем, новая ли эта сессия, т.е. был ли смартапп запущен только-что:
      const isNewSession = payload.new_session;

      // Завершена ли сессия; присвоим true, когда юзер проявит желание завершить игру:
      let isEndSession = false;

      // Продолжаем ли игру; присваиваем true, когда юзер пожелает слушать ещё:
      let isPlayIntent = false;

      // Дать ли справку; присваиваем true, когда юзер запросит помощь:
      let isHelpIntent = false;

      // Закрыть ли смартап; присвоим true, когда юзер захочет завершить игру:
      let isExitIntent = false;

      // Проверяем фразу юзера на наличие фраз, дающих основание полагать, что юзер хочет продолжить игру:
      for (let item of playWords) {
        if (includes(userUtterance, item)) {
          isPlayIntent = true;
          break;
        }
      }

      // Если фраз, свидетельствующих о намерении юзера продолжить игрк не обнаружено, проверяем на наличие фраз, 
      // дающих основание полагать, что юзер запросил помощь:
      if (!isPlayIntent) {
        for (let item of helpWords) {
          if (includes(userUtterance, item)) {
            isHelpIntent = true;
            break;
          }
        }
      }

      // Если фраз, свидетельствующих о том, что юзер хочет играть или запрсил помощь не обнаружено, 
      // проверяем его фразу на наличие слов, указывающих на его желание завершить игру:
      if (!isPlayIntent && !isHelpIntent) {
        for (let item of exitWords) {
          if (includes(userUtterance, item)) {
            isExitIntent = true;
            break;
          }
        }
      }

      // Перманентный вопрос к юзеру из серии: "Хотите продолжить?":
      const nextPromt = `${sample(lexicon.wish)} ${sample(lexicon.know)} ${sample(lexicon.question)}`;

      if (isNewSession) { // это новая сессия 
        msg = `${sample(lexicon.hello_1)} ${sample(lexicon.hello_2)} ${sample(lexicon.wish)} ${sample(lexicon.hello_3)}`;
      } else { // сессия не новая
        if (isPlayIntent) { // юзер хочет слушать
          msg = `${await getData(api)} ${nextPromt}`;
        } else if (isHelpIntent) { // юзер хочет получить справку:
          msg = `${lexicon.help} ${nextPromt}`;
        } else if (isExitIntent) { // юзер хочет выйти:
          msg = `${sample(lexicon.bye)}`;
          isEndSession = true;
        } else { // Фраза юзера непонятна:
          msg = `${sample(lexicon.unclear_1)} ${sample(lexicon.unclear_2)} ${sample(lexicon.unclear_3)}`;
        }
      }

      // Формируем объект (пейлауд), который будет отправлен в Салют в качестве ответа юзеру (ANSWER_TO_USER):
      let resPayload = {
        pronounceText: msg,
        pronounceTextType: 'application/text',
        items: [{
          bubble: {
            text: msg
          }
        }
        ],
        suggestions: {
          buttons: [
            {
              title: 'Слушать',
              action: {
                text: 'Слушать',
                type: 'text'
              }
            },
            {
              title: 'Выход',
              action: {
                text: 'Выход',
                type: 'text'
              }
            }
          ]
        },
        auto_listening: true,
        finished: false,
        device: device
      };

      // Если сессия закрыта (т.е. определено, что юзер пожелал завершить игру) - пейлауд модефицируется:
      if (isEndSession) {
        resPayload = {
          pronounceText: msg,
          pronounceTextType: 'application/text',
          items: [
            {
              bubble: {
                text: msg
              }
            }
          ],
          finished: true,
          device: device
        };
      }

      // Возвращаем наш ответ в Салют (с пометкой: NSWER_TO_USER):
      return {
        body: JSON.stringify({
          messageName: 'ANSWER_TO_USER',
          sessionId: body.sessionId,
          messageId: body.messageId,
          uuid: body.uuid,
          payload: resPayload
        })
      };

      // RUN_APP означает, что юзер только-что запустил смартап. 
      // Сообщение (msg) с приветствием, мы уже инициализировали в начале кода:
    } else if (body.messageName == 'RUN_APP') {
      // Возвращаем нащ ответ в Салют (с пометкой: NSWER_TO_USER):
      return {
        body: JSON.stringify({
          messageName: 'ANSWER_TO_USER',
          sessionId: body.sessionId,
          messageId: body.messageId,
          uuid: body.uuid,
          payload: {
            pronounceText: msg,
            pronounceTextType: 'application/text',
            items: [{
              bubble: {
                text: msg
              }
            }],
            suggestions: {
              buttons: [
                {
                  title: 'Слушать',
                  action: {
                    text: 'Слушать',
                    type: 'text'
                  }
                },
                {
                  title: 'Выход',
                  action: {
                    text: 'Выход',
                    type: 'text'
                  }
                }
              ]
            },
            auto_listening: true,
            finished: false,
            device: device
          }
        })
      };
    }
    // В случае ошибки возвращаем ответ в Салют с пометкой: ERROR:
  } catch (err) {
    console.log(err);
    return {
      statusCode: 400,
      body: JSON.stringify({
        messageName: 'ERROR',
        sessionId: body.sessionId,
        messageId: body.messageId,
        uuid: body.uuid,
        payload: {
          code: 666,
          description: 'Damn error!',
          device: device
        }
      })
    };
  }
};