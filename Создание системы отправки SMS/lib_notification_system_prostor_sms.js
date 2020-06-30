// Название функции и ее параметры менять нельзя!
function SendNotification(oParam) {
  // Стандартный объект, который будет возвращаться функция
  oRes = {
    'error': 0,
    'error_text': '',
    'sRecipients': '',
  };

  // Считываем параметры из карточки системы уведомления
  iActiveNotificationID = oParam.GetOptProperty('iActiveNotificationID', null);
  docActiveNotification = oParam.GetOptProperty('docActiveNotification', null);

  sServiceUrl = oParam.GetOptProperty('sServiceUrl', '');
  sUser = oParam.GetOptProperty('sUser', '');
  sPassword = oParam.GetOptProperty('sPassword', '');
  sSender = oParam.GetOptProperty('sSendName', '');

  // Копипаст из email. Если не передан документ уведомления - открываем его.
  if (docActiveNotification == null) {
    try {
      docActiveNotification = OpenDoc(UrlFromDocID(iActiveNotificationID));
    } catch (err) {
      oRes.error = 1;
      oRes.error_text = 'Error. Open active notification document falied. Active notification ID ' + iActiveNotificationID + '. ' + err;
      return oRes;
    }
  }

  // Копипаст из email. В уведомлении увеличиваем счетчик попытки отправки, дату отправки - текущая дата, статус - отправлен.
  docActiveNotification.TopElem.send_counter += 1;
  docActiveNotification.TopElem.status = 'sent';
  docActiveNotification.TopElem.last_send_date = Date();

  // если открыть карточку уведомления, то можно увидеть, что в адресаты добавляется только email сотрудника
  // Свойство sRecipients объекта oRes - строка с данными кому отправлены уведомления, отображаются в логе "email", мы будем отображать ФИО получателя
  oRes.sRecipients = ArrayMerge(docActiveNotification.TopElem.recipients, 'name', ', ');

  // Некоторые уведомления отправляются в формате HTML, преобразуем весь HTML в текст
  MessageText = HtmlToPlainText(docActiveNotification.TopElem.body);

  // Изменим тип сообщения и саму текстовку в сообщении так, как это должно быть для SMS
  docActiveNotification.TopElem.body_type = 'plane';
  docActiveNotification.TopElem.body = MessageText;

  // Цикл по каждому адресату
  for (recipient in docActiveNotification.TopElem.recipients) {

    // Открываем объект сотрудника
    docCollaborator = recipient.collaborator_id.OptForeignElem;

    // Считываем мобильный номер сотрудника, Мы будем брать данные только из поля "Мобильный телефон"
    // Тут может быть добавлена любая обработка карточки сотрудника или номера телефона
    if (docCollaborator != undefined) {
      mobile_phone = docCollaborator.mobile_phone;

      // Обрежем знак + вначале номера телефона, если он есть
      if (mobile_phone != '' && StrBegins(mobile_phone, '+', true) == true) {
        mobile_phone = StrRightRangePos(mobile_phone, 1);
      }

      if (mobile_phone == '') {
        continue;
      }
    } else {
      continue;
    }

    // Добавляем в картчоку уведомления номер телефона, на который будет отправлено сообщение
    recipient.mobile_phone = mobile_phone;

    // Создаем объект для отправки провайдеру, объект будет преобразован в JSON
    objToSend = new Object();
    objToSend.scheduleTime = docActiveNotification.TopElem.send_date;
    objToSend.statusQueueName = 'myQueue';
    objToSend.showBillingDetails = true;
    objToSend.login = sUser;
    objToSend.password = sPassword;
    objToSend.sender = sSender;

    // API устроено так, что отправляемые сообщения должны быть объектами и находиться в массиве, подробнее на сайте провайдера.
    aMessages = [];

    // Создаем объект сообщения
    oMessage = new Object();
    oMessage.phone = mobile_phone;
    oMessage.clientId = iActiveNotificationID;
    oMessage.text = EncodeCharset(MessageText, 'utf-8');

    // Добавляем сообщение в массив
    aMessages.push(oMessage);

    // Добавляем массив с сообщения ми в объект отправки
    objToSend.messages = aMessages;

    // Формируем JSON из объекта отправки
    sBodyJson = EncodeJson(objToSend);

    // Отправляем наш JSON провайдеру? Если произошла ошибка, меняем статус сообщения
    try {
      response = HttpRequest(sServiceUrl, 'post', sBodyJson);
    } catch (e) {
      docActiveNotification.TopElem.status = 'send_error';
      oRes.error = 2;
      oRes.error_text = 'Error. Failed to send request to server. Active notification ID ' + iActiveNotificationID + '. ' + e;
    }
  }

  // Проверим ответ сервера
  try {
    responseJSON = tools.read_object(response.Body);
    if (responseJSON.status != 'ok') {
      docActiveNotification.TopElem.status = 'send_error';
      oRes.error = 3;
      oRes.error_text = 'Error. ' + responseJSON.description + '. Active notification ID ' + iActiveNotificationID + '.';
    }
  } catch (e) {
    docActiveNotification.TopElem.status = 'send_error';
    oRes.error = 3;
    oRes.error_text = 'Error. No response received from server. Active notification ID ' + iActiveNotificationID + '. ' + e;
  }

  // Сохраняем карточку уведомления
  try {
    docActiveNotification.Save();
  } catch (e) {
    oRes.error = 4;
    oRes.error_text = 'Error. Save active notification status failed. Active notification ID ' + iActiveNotificationID + '. ' + e;
  }

  // Отправляем результат
  return oRes;
}
