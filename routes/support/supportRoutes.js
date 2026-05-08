import express from "express";
import SupportTicket from "../../models/SupportTicket.js";

const router = express.Router();

/* ================= CREATE TICKET ================= */

router.post("/", async (req, res) => {
  try {
    const { customerName, email, subject, message } = req.body;

    const ticket = await SupportTicket.create({
      customerName,
      email,
      subject,
      message,
      status: "open",
      replies: []
    });

    const io = req.app.get("io");
    io.to("admin").emit("support:new-message", {
      sender: "customer",
      ticketId: ticket._id,
      message: `${customerName} created ticket: ${subject}`
    });

    res.json({ success: true, data: ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

/* ================= REPLY ================= */

router.post("/:id/reply", async (req, res) => {
  try {
    const { sender, message } = req.body;

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    const cleanSender = sender === "customer" ? "customer" : "admin";
    ticket.replies.push({ sender: cleanSender, message, createdAt: new Date() });
    await ticket.save();

    const io = req.app.get("io");
    const target = cleanSender === "admin" ? ticket.email : "admin";
    io.to(target).emit("support:new-message", {
      sender: cleanSender,
      ticketId: ticket._id,
      message: cleanSender === "admin" ? "Admin replied" : `${ticket.customerName} replied`
    });

    res.json({ success: true, data: ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

export default router;