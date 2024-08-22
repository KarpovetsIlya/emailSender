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
    if (
      userSteps[chatId]?.step === "awaitingSubcategory" ||
      userSteps[chatId]?.step === "awaitingMessageSubcategory"
    ) {
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
    } else if (
      userSteps[chatId]?.step === "awaitingCategory" ||
      userSteps[chatId]?.step === "awaitingMessage"
    ) {
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
          keyboard: [...categoryButtons, [{ text: "Назад" }]],
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
          keyboard: [...subcategoryButtons, [{ text: "Назад" }]],
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
    const selectedCategoryName = userSteps[chatId].selectedCategory.name;
    const selectedSubcategoryName = userSteps[chatId].selectedSubcategory.name;
    const selectedOrganisationNames = userSteps[
      chatId
    ].selectedSubcategory.children.map((org) => org.name);
    const emails = userSteps[chatId].selectedSubcategory.children.map(
      (org) => org.mail
    );
    const subject = `Сообщение по теме ${userSteps[chatId].selectedCategory.viewName}`;
    const message = text;

    console.log("Sending Message with Category Name:", selectedCategoryName);
    console.log("Selected Subcategory Name:", selectedSubcategoryName);
    console.log("Selected Organisation Names:", selectedOrganisationNames);
    console.log("Emails:", emails);

    try {
      const response = await axios.post(
        "http://localhost:3000/api/emails/send",
        {
          userId: chatId,
          emails,
          subject,
          message,
          category_name: selectedCategoryName,
          subcategory_name: selectedSubcategoryName,
          organisation_names: selectedOrganisationNames,
        }
      );

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
});
