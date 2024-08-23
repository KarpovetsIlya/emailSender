const pool = require("../config/db");
const transporter = require("../config/mail");

async function getUserId(telegramId) {
  const res = await pool.query("SELECT id FROM users WHERE telegram_id = $1", [
    telegramId,
  ]);
  return res.rows[0]?.id;
}

exports.sendEmails = async (req, res) => {
  const {
    userId,
    emails,
    message,
    category_id,
    category_name,
    subcategory_id,
    subcategory_name,
    organisation_ids = [],
    organisation_names = [],
    file_url = null,
  } = req.body;

  try {
    let user_id = await getUserId(userId);

    if (!user_id) {
      const newUser = await pool.query(
        "INSERT INTO users (telegram_id) VALUES ($1) RETURNING id",
        [userId]
      );
      user_id = newUser.rows[0].id;
    }

    let successfulEmails = [];

    for (let email of emails) {
      try {
        await transporter.sendMail({
          from: `<${process.env.EMAIL_USER}>`,
          to: email,
          text: message,
          attachments: file_url ? [{ path: file_url }] : [],
        });

        successfulEmails.push(email);
      } catch (error) {
        console.error(
          `Ошибка при отправке письма на ${email}: ${error.message}`
        );
      }
    }

    if (successfulEmails.length > 0) {
      await pool.query(
        `INSERT INTO sent_emails (
          user_id,           
          category_id, 
          category_name, 
          subcategory_id, 
          subcategory_name, 
          organisation_ids, 
          organisation_names,
          email_addresses, 
          message,
          file_url
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          user_id,
          category_id,
          category_name,
          subcategory_id,
          subcategory_name,
          organisation_ids,
          organisation_names,
          successfulEmails,
          message,
          file_url,
        ]
      );
    }

    res.status(200).json({ success: "Письма успешно отправлены" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Произошла ошибка при отправке писем" });
  }
};

exports.getSentEmails = async (req, res) => {
  const { userId } = req.params;
  try {
    const user_id = await getUserId(userId);

    if (!user_id) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const emails = await pool.query(
      "SELECT * FROM sent_emails WHERE user_id = $1",
      [user_id]
    );

    res.json(emails.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.getEmailHierarchy = async (req, res) => {
  try {
    const categories = await pool.query("SELECT * FROM categories");
    const result = [];

    for (let category of categories.rows) {
      const subcategories = await pool.query(
        "SELECT * FROM subcategories WHERE category_id = $1",
        [category.id]
      );

      const categoryObj = {
        name: category.name,
        viewName: category.view_name,
        type: "category",
        children: [],
      };

      for (let subcategory of subcategories.rows) {
        const organisations = await pool.query(
          "SELECT * FROM organisations WHERE subcategory_id = $1",
          [subcategory.id]
        );

        const subcategoryObj = {
          name: subcategory.name,
          viewName: subcategory.view_name,
          type: "category",
          children: organisations.rows.map((org) => ({
            name: org.name,
            viewName: org.view_name,
            type: "organisation",
            mail: org.email,
          })),
        };

        categoryObj.children.push(subcategoryObj);
      }

      result.push(categoryObj);
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
