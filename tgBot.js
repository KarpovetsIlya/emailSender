const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();
const axios = require("axios");

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

let userSteps = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  const options = {
    reply_markup: {
      keyboard: [
        [{ text: "Отправить сообщение" }],
        [{ text: "Посмотреть историю" }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };

  bot.sendMessage(chatId, "Добро пожаловать! Выберите действие:", options);
  userSteps[chatId] = { step: "main" };
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "Назад") {
    if (userSteps[chatId]?.step === "awaitingSubcategory") {
      const categoryButtons = userSteps[chatId].hierarchy.map((category) => [
        { text: category.viewName },
      ]);
      const options = {
        reply_markup: {
          keyboard: [...categoryButtons, [{ text: "Назад" }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      };

      bot.sendMessage(chatId, "Выберите категорию:", options);
      userSteps[chatId].step = "awaitingCategory";
    } else if (userSteps[chatId]?.step === "awaitingCategory") {
      const options = {
        reply_markup: {
          keyboard: [
            [{ text: "Отправить сообщение" }],
            [{ text: "Посмотреть историю" }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      };

      bot.sendMessage(chatId, "Выберите действие:", options);
      userSteps[chatId] = { step: "main" };
    }
    return;
  }

  if (text === "Посмотреть историю" || text === "Отправить сообщение") {
    try {
      const response = await axios.get(
        "http://localhost:3000/api/emails/hierarchy"
      );
      const hierarchy = response.data;

      console.log("Hierarchy Data:", JSON.stringify(hierarchy, null, 2));

      const categoryButtons = hierarchy.map((category) => [
        { text: category.viewName },
      ]);
      const options = {
        reply_markup: {
          keyboard: [...categoryButtons],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      };

      const step =
        text === "Посмотреть историю"
          ? "awaitingCategory"
          : "awaitingMessageCategory";

      bot.sendMessage(chatId, "Выберите категорию:", options);
      userSteps[chatId] = { step, hierarchy };
    } catch (error) {
      bot.sendMessage(chatId, `Произошла ошибка: ${error.message}`);
    }
  } else if (
    userSteps[chatId]?.step === "awaitingCategory" ||
    userSteps[chatId]?.step === "awaitingMessageCategory"
  ) {
    const selectedCategory = userSteps[chatId].hierarchy.find(
      (category) => category.viewName === text
    );

    if (selectedCategory) {
      console.log("Selected Category Name:", selectedCategory.name);

      const subcategoryButtons = selectedCategory.children.map(
        (subcategory) => [{ text: subcategory.viewName }]
      );
      const options = {
        reply_markup: {
          keyboard: [...subcategoryButtons],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      };

      bot.sendMessage(chatId, "Выберите подкатегорию:", options);
      userSteps[chatId].step =
        userSteps[chatId].step === "awaitingCategory"
          ? "awaitingSubcategory"
          : "awaitingMessageSubcategory";
      userSteps[chatId].selectedCategory = selectedCategory;
    }
  } else if (
    userSteps[chatId]?.step === "awaitingSubcategory" ||
    userSteps[chatId]?.step === "awaitingMessageSubcategory"
  ) {
    const selectedSubcategory = userSteps[
      chatId
    ].selectedCategory.children.find(
      (subcategory) => subcategory.viewName === text
    );

    if (selectedSubcategory) {
      console.log("Selected Subcategory Name:", selectedSubcategory.name);

      if (userSteps[chatId].step === "awaitingSubcategory") {
        const orgMessages = selectedSubcategory.children
          .map((org) => `${org.viewName}: ${org.mail}`)
          .join("\n");
        bot.sendMessage(chatId, `Организации:\n${orgMessages}`);

        userSteps[chatId] = { step: "main" };
        bot.sendMessage(chatId, "Выберите действие:", {
          reply_markup: {
            keyboard: [
              [{ text: "Отправить сообщение" }],
              [{ text: "Посмотреть историю" }],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
      } else {
        userSteps[chatId].step = "awaitingMessage";
        userSteps[chatId].selectedSubcategory = selectedSubcategory;

        bot.sendMessage(
          chatId,
          "Введите текст сообщения, которое хотите отправить."
        );
      }
    }
  } else if (userSteps[chatId]?.step === "awaitingMessage") {
    userSteps[chatId].messageText = text;

    const options = {
      reply_markup: {
        keyboard: [
          [{ text: "Прикрепить файл" }, { text: "Отправить без файла" }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    };

    bot.sendMessage(chatId, "Хотите прикрепить файл к сообщению?", options);
    userSteps[chatId].step = "awaitingFileOption";
  } else if (userSteps[chatId]?.step === "awaitingFileOption") {
    if (text === "Прикрепить файл") {
      bot.sendMessage(chatId, "Пожалуйста, отправьте файл.");
      userSteps[chatId].step = "awaitingFile";
    } else if (text === "Отправить без файла") {
      await sendEmail(chatId, userSteps[chatId].messageText);
    }
  } else if (userSteps[chatId]?.step === "awaitingFile") {
    if (msg.document) {
      const fileId = msg.document.file_id;
      const fileUrl = await bot.getFileLink(fileId);

      userSteps[chatId].fileUrl = fileUrl;

      await sendEmail(chatId, userSteps[chatId].messageText, fileUrl);
    } else {
      bot.sendMessage(chatId, "Это не файл. Пожалуйста, отправьте документ.");
    }
  }
});

async function sendEmail(chatId, messageText, fileUrl = null) {
  const {
    selectedCategory,
    selectedSubcategory,
    selectedSubcategory: { children },
  } = userSteps[chatId];

  const selectedCategoryId = selectedCategory.id;
  const selectedSubcategoryId = selectedSubcategory.id;
  const selectedOrganisationIds = children.map((org) => org.id);
  const selectedCategoryName = selectedCategory.name;
  const selectedSubcategoryName = selectedSubcategory.name;
  const selectedOrganisationNames = children.map((org) => org.name);
  const emails = children.map((org) => org.mail);
  const subject = `Сообщение по теме ${selectedCategory.viewName}`;

  try {
    const response = await axios.post("http://localhost:3000/api/emails/send", {
      userId: chatId,
      emails,
      subject,
      message: messageText,
      category_id: selectedCategoryId,
      subcategory_id: selectedSubcategoryId,
      organisation_ids: selectedOrganisationIds,
      category_name: selectedCategoryName,
      subcategory_name: selectedSubcategoryName,
      organisation_names: selectedOrganisationNames,
      file_url: fileUrl,
    });

    if (response.data.success) {
      bot.sendMessage(chatId, "Сообщение успешно отправлено и сохранено!");
    }

    userSteps[chatId] = { step: "main" };
    bot.sendMessage(chatId, "Выберите действие:", {
      reply_markup: {
        keyboard: [
          [{ text: "Отправить сообщение" }],
          [{ text: "Посмотреть историю" }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  } catch (error) {
    bot.sendMessage(
      chatId,
      `Произошла ошибка при отправке сообщения: ${error.message}`
    );
  }
}
