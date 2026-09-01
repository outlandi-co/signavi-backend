import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import fetch from "node-fetch"

import {
  sendOrderStatusEmail
} from "../utils/sendEmail.js"

import {
  generateInvoice
} from "../utils/generateInvoice.js"

const router = express.Router()

console.log("🔥 ORDERS ROUTES ACTIVE")

/* =========================================================
   CONSTANTS
========================================================= */

const TAX_RATE = 0.0825

const VALID_ORDER_STATUSES = [
  "pending",
  "payment_required",
  "paid",
  "production",
  "pickup_shipping",
  "shipping",
  "shipped",
  "delivered",
  "completed",
  "denied",
  "archive"
]

/* =========================================================
   HELPERS
========================================================= */

const safeNumber = (
  value,
  fallback = 0
) => {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return fallback
  }

  return number
}

const safePositiveNumber = (
  value,
  fallback = 0
) => {
  const number = Number(value)

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return fallback
  }

  return number
}

const safeQuantity = (
  value,
  fallback = 1
) => {
  const number = Number(value)

  if (
    !Number.isFinite(number) ||
    number < 1
  ) {
    return fallback
  }

  return Math.floor(number)
}

const normalizeEmail = (
  email = ""
) => {
  return String(email)
    .trim()
    .toLowerCase()
}

const roundMoney = (
  value
) => {
  return Number(
    safeNumber(
      value,
      0
    ).toFixed(2)
  )
}

const getShippingService = (
  shippingRate,
  fallback = ""
) => {
  if (
    typeof shippingRate?.servicelevel ===
    "string"
  ) {
    return shippingRate.servicelevel
  }

  return (
    shippingRate?.servicelevel?.name ||
    shippingRate?.servicelevel?.token ||
    fallback ||
    ""
  )
}

/* =========================================================
   SOCKET
========================================================= */

const emitOrderUpdate = (
  req,
  order
) => {
  const io =
    req.app.get("io")

  if (io) {
    io.emit(
      "jobUpdated",
      order
    )
  }
}

const emitOrderCreated = (
  req,
  order
) => {
  const io =
    req.app.get("io")

  if (io) {
    io.emit(
      "jobCreated",
      order
    )
  }
}

/* =========================================================
   GET ALL ORDERS
========================================================= */

router.get(
  "/",
  async (req, res) => {
    try {
      const orders =
        await Order.find()
          .sort({
            createdAt: -1
          })

      return res.json({
        success: true,
        count: orders.length,
        data: orders
      })
    } catch (err) {
      console.error(
        "❌ GET ORDERS ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,
          message:
            err.message ||
            "Failed to load orders"
        })
    }
  }
)

/* =========================================================
   GET CUSTOMER ORDERS
========================================================= */

router.get(
  "/my-orders",
  async (req, res) => {
    try {
      const email =
        normalizeEmail(
          req.query.email
        )

      if (!email) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Email is required"
          })
      }

      const orders =
        await Order.find({
          email: {
            $regex:
              `^${email}$`,
            $options: "i"
          }
        }).sort({
          createdAt: -1
        })

      console.log(
        "📧 MY ORDERS EMAIL:",
        email
      )

      console.log(
        "📦 MY ORDERS FOUND:",
        orders.length
      )

      return res.json({
        success: true,
        count: orders.length,
        data: orders
      })
    } catch (err) {
      console.error(
        "❌ MY ORDERS ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,
          message:
            err.message ||
            "Failed to load customer orders"
        })
    }
  }
)

/* =========================================================
   PACKING SLIP
========================================================= */

router.get(
  "/:id/packing-slip",
  async (req, res) => {
    try {
      const { id } =
        req.params

      if (
        !mongoose.Types.ObjectId
          .isValid(id)
      ) {
        return res
          .status(400)
          .send(
            "Invalid order ID"
          )
      }

      const order =
        await Order.findById(
          id
        )

      if (!order) {
        return res
          .status(404)
          .send(
            "Order not found"
          )
      }

      const address =
        order.address || {}

      const html = `
        <!DOCTYPE html>

        <html>
          <head>
            <title>
              Packing Slip
            </title>

            <style>
              body {
                font-family: Arial, sans-serif;
                padding: 40px;
                color: #111;
              }

              h1 {
                margin-bottom: 5px;
              }

              .section {
                margin-top: 25px;
              }

              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 15px;
              }

              th,
              td {
                border: 1px solid #ccc;
                padding: 10px;
                text-align: left;
              }

              th {
                background: #f2f2f2;
              }

              .print-btn {
                margin-bottom: 20px;
                padding: 10px 14px;
                cursor: pointer;
              }

              @media print {
                .print-btn {
                  display: none;
                }
              }
            </style>
          </head>

          <body>
            <button
              class="print-btn"
              onclick="window.print()"
            >
              Print Packing Slip
            </button>

            <h1>
              SignaVi Studio
            </h1>

            <p>
              <strong>
                Packing Slip
              </strong>
            </p>

            <p>
              Order #
              ${order._id
                .toString()
                .slice(-6)}
            </p>

            <div class="section">
              <h2>
                Customer
              </h2>

              <p>
                ${
                  order.customerName ||
                  "Customer"
                }
              </p>

              <p>
                ${
                  order.email ||
                  ""
                }
              </p>

              <p>
                ${
                  order.phone ||
                  ""
                }
              </p>
            </div>

            <div class="section">
              <h2>
                Ship To
              </h2>

              <p>
                ${
                  address.street ||
                  ""
                }
              </p>

              <p>
                ${
                  address.city ||
                  ""
                },
                ${
                  address.state ||
                  ""
                }
                ${
                  address.zip ||
                  ""
                }
              </p>

              <p>
                ${
                  address.country ||
                  "US"
                }
              </p>
            </div>

            <div class="section">
              <h2>
                Items
              </h2>

              <table>
                <thead>
                  <tr>
                    <th>
                      Item
                    </th>

                    <th>
                      Variant
                    </th>

                    <th>
                      Qty
                    </th>
                  </tr>
                </thead>

                <tbody>
                  ${(order.items || [])
                    .map(
                      (item) => `
                        <tr>
                          <td>
                            ${
                              item.name ||
                              "Item"
                            }
                          </td>

                          <td>
                            ${
                              item.variant
                                ?.color ||
                              "-"
                            }
                            /
                            ${
                              item.variant
                                ?.size ||
                              "-"
                            }
                          </td>

                          <td>
                            ${
                              item.quantity ||
                              1
                            }
                          </td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `

      res.setHeader(
        "Content-Type",
        "text/html"
      )

      return res.send(
        html
      )
    } catch (err) {
      console.error(
        "❌ PACKING SLIP ERROR:",
        err
      )

      return res
        .status(500)
        .send(
          "Packing slip failed"
        )
    }
  }
)

/* =========================================================
   PRINT ALL
========================================================= */

router.get(
  "/:id/print-all",
  async (req, res) => {
    try {
      const { id } =
        req.params

      if (
        !mongoose.Types.ObjectId
          .isValid(id)
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid order ID"
          })
      }

      const order =
        await Order.findById(
          id
        )

      if (!order) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Order not found"
          })
      }

      const baseUrl =
        process.env.SERVER_URL ||
        "https://signavi-backend.onrender.com"

      return res.json({
        success: true,

        label:
          order.trackingLabelUrl ||
          "",

        packingSlip:
          `${baseUrl}/api/orders/${order._id}/packing-slip`,

        invoice:
          `${baseUrl}/api/orders/${order._id}/invoice`
      })
    } catch (err) {
      console.error(
        "❌ PRINT ALL ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,
          message:
            err.message
        })
    }
  }
)

/* =========================================================
   DOWNLOAD INVOICE
========================================================= */

router.get(
  "/:id/invoice",
  async (req, res) => {
    try {
      const { id } =
        req.params

      if (
        !mongoose.Types.ObjectId
          .isValid(id)
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid order ID"
          })
      }

      const order =
        await Order.findById(
          id
        )

      if (!order) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Order not found"
          })
      }

      const invoicePath =
        await generateInvoice(
          order
        )

      const fileName =
        `signavi-invoice-${order._id
          .toString()
          .slice(-6)}.pdf`

      return res.download(
        invoicePath,
        fileName
      )
    } catch (err) {
      console.error(
        "❌ INVOICE DOWNLOAD ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Failed to download invoice",
          error:
            err.message
        })
    }
  }
)

/* =========================================================
   EMAIL INVOICE
========================================================= */

router.post(
  "/:id/send-invoice",
  async (req, res) => {
    try {
      const { id } =
        req.params

      if (
        !mongoose.Types.ObjectId
          .isValid(id)
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid order ID"
          })
      }

      const order =
        await Order.findById(
          id
        )

      if (!order) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Order not found"
          })
      }

      if (!order.email) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Order does not have a customer email"
          })
      }

      const invoicePath =
        await generateInvoice(
          order
        )

      await sendOrderStatusEmail(
        order.email,
        "invoice",
        order,
        invoicePath
      )

      return res.json({
        success: true,
        message:
          "Invoice sent successfully"
      })
    } catch (err) {
      console.error(
        "❌ SEND INVOICE ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Failed to send invoice",
          error:
            err.message
        })
    }
  }
)

/* =========================================================
   CREATE CUSTOM ORDER
========================================================= */

router.post(
  "/custom",
  async (req, res) => {
    try {
      const {
        customerName,
        email,
        phone,
        address,
        items,
        shipping,
        shippingCost,
        paymentMethod,
        notes,
        status
      } = req.body || {}

      if (!customerName) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Customer name is required"
          })
      }

      if (!email) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Customer email is required"
          })
      }

      if (
        !Array.isArray(items) ||
        !items.length
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "At least one item is required"
          })
      }

      const requestedStatus =
        status ||
        "payment_required"

      if (
        !VALID_ORDER_STATUSES.includes(
          requestedStatus
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              `Invalid order status: ${requestedStatus}`
          })
      }

      const safeItems =
        items.map(
          (item) => ({
            name:
              String(
                item?.name ||
                "Custom Service"
              ).trim(),

            quantity:
              safeQuantity(
                item?.quantity,
                1
              ),

            price:
              safePositiveNumber(
                item?.price,
                0
              ),

            unitPrice:
              safePositiveNumber(
                item?.unitPrice,
                item?.price || 0
              ),

            finalPrice:
              safePositiveNumber(
                item?.finalPrice,
                item?.price || 0
              ),

            cost:
              safePositiveNumber(
                item?.cost,
                0
              ),

            serviceType:
              String(
                item?.serviceType ||
                ""
              ).trim(),

            source:
              item?.source ||
              "admin",

            variant:
              item?.variant ||
              {}
          })
        )

      const subtotal =
        roundMoney(
          safeItems.reduce(
            (
              sum,
              item
            ) =>
              sum +
              item.price *
              item.quantity,
            0
          )
        )

      const tax =
        roundMoney(
          subtotal *
          TAX_RATE
        )

      const selectedShipping =
        safePositiveNumber(
          shippingCost ??
          shipping,
          0
        )

      const finalPrice =
        roundMoney(
          subtotal +
          tax +
          selectedShipping
        )

      const order =
        await Order.create({
          customerName:
            String(
              customerName
            ).trim(),

          email:
            normalizeEmail(
              email
            ),

          phone:
            String(
              phone ||
              ""
            ).trim(),

          address: {
            street:
              address?.street ||
              "",

            city:
              address?.city ||
              "",

            state:
              address?.state ||
              "",

            zip:
              address?.zip ||
              "",

            country:
              address?.country ||
              "US"
          },

          items:
            safeItems,

          subtotal,
          tax,

          shipping:
            selectedShipping,

          shippingCost:
            selectedShipping,

          shippingTotal:
            selectedShipping,

          deliveryFee:
            selectedShipping,

          finalPrice,

          paymentMethod:
            paymentMethod ||
            "",

          notes:
            notes ||
            "",

          orderType:
            "custom",

          source:
            "admin",

          status:
            requestedStatus,

          timeline: [
            {
              status:
                requestedStatus,

              note:
                "Custom order created",

              date:
                new Date()
            }
          ]
        })

      emitOrderCreated(
        req,
        order
      )

      console.log(
        "✅ CUSTOM ORDER CREATED:",
        order._id
      )

      return res
        .status(201)
        .json({
          success: true,
          data: order
        })
    } catch (err) {
      console.error(
        "❌ CREATE CUSTOM ORDER ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,
          message:
            err.message
        })
    }
  }
)

/* =========================================================
   DOWNLOAD RECEIPT
========================================================= */

router.get(
  "/:id/receipt",
  async (req, res) => {
    try {
      const { id } =
        req.params

      if (
        !mongoose.Types.ObjectId
          .isValid(id)
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid order ID"
          })
      }

      const order =
        await Order.findById(
          id
        )

      if (!order) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Order not found"
          })
      }

      order.receiptCreatedAt =
        order.receiptCreatedAt ||
        new Date()

      await order.save()

      const html = `
        <!DOCTYPE html>

        <html>
          <head>
            <title>
              Receipt
            </title>

            <style>
              body {
                font-family: Arial, sans-serif;
                padding: 40px;
                color: #111;
              }

              h1 {
                margin-bottom: 4px;
              }

              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
              }

              th,
              td {
                border: 1px solid #ccc;
                padding: 10px;
                text-align: left;
              }

              th {
                background: #f2f2f2;
              }

              .total {
                margin-top: 20px;
                font-size: 18px;
                font-weight: bold;
              }

              .print-btn {
                margin-bottom: 20px;
                padding: 10px 14px;
                cursor: pointer;
              }

              @media print {
                .print-btn {
                  display: none;
                }
              }
            </style>
          </head>

          <body>
            <button
              class="print-btn"
              onclick="window.print()"
            >
              Print / Save Receipt
            </button>

            <h1>
              SignaVi Studio
            </h1>

            <p>
              <strong>
                Receipt
              </strong>
            </p>

            <p>
              Order #
              ${order._id
                .toString()
                .slice(-6)}
            </p>

            <p>
              Date Created:
              ${
                order.createdAt
                  ? new Date(
                      order.createdAt
                    ).toLocaleString()
                  : ""
              }
            </p>

            <p>
              Receipt Created:
              ${
                order.receiptCreatedAt
                  ? new Date(
                      order.receiptCreatedAt
                    ).toLocaleString()
                  : ""
              }
            </p>

            <h2>
              Customer
            </h2>

            <p>
              ${
                order.customerName ||
                "Customer"
              }
            </p>

            <p>
              ${
                order.email ||
                ""
              }
            </p>

            <p>
              ${
                order.phone ||
                ""
              }
            </p>

            <h2>
              Items
            </h2>

            <table>
              <thead>
                <tr>
                  <th>
                    Item
                  </th>

                  <th>
                    Qty
                  </th>

                  <th>
                    Price
                  </th>

                  <th>
                    Total
                  </th>
                </tr>
              </thead>

              <tbody>
                ${(order.items || [])
                  .map(
                    (item) => `
                      <tr>
                        <td>
                          ${
                            item.name ||
                            "Item"
                          }
                        </td>

                        <td>
                          ${
                            item.quantity ||
                            1
                          }
                        </td>

                        <td>
                          $${Number(
                            item.price ||
                            0
                          ).toFixed(2)}
                        </td>

                        <td>
                          $${Number(
                            (
                              item.price ||
                              0
                            ) *
                            (
                              item.quantity ||
                              1
                            )
                          ).toFixed(2)}
                        </td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>

            <p>
              Subtotal:
              $${Number(
                order.subtotal ||
                0
              ).toFixed(2)}
            </p>

            <p>
              Tax:
              $${Number(
                order.tax ||
                0
              ).toFixed(2)}
            </p>

            <p>
              Shipping:
              $${Number(
                order.shippingCost ??
                order.shipping ??
                0
              ).toFixed(2)}
            </p>

            <p class="total">
              Total:
              $${Number(
                order.finalPrice ||
                0
              ).toFixed(2)}
            </p>

            <p>
              Status:
              ${
                order.status ||
                ""
              }
            </p>

            <p>
              Payment Method:
              ${
                order.paymentMethod ||
                "Online"
              }
            </p>
          </body>
        </html>
      `

      res.setHeader(
        "Content-Type",
        "text/html"
      )

      return res.send(
        html
      )
    } catch (err) {
      console.error(
        "❌ RECEIPT ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Failed to generate receipt",
          error:
            err.message
        })
    }
  }
)

/* =========================================================
   GET SINGLE ORDER
========================================================= */

router.get(
  "/:id",
  async (req, res) => {
    try {
      const { id } =
        req.params

      if (
        !mongoose.Types.ObjectId
          .isValid(id)
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid order ID"
          })
      }

      const order =
        await Order.findById(
          id
        )

      if (!order) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Order not found"
          })
      }

      return res.json({
        success: true,
        data: order
      })
    } catch (err) {
      console.error(
        "❌ GET ORDER BY ID ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Failed to fetch order",
          error:
            err.message
        })
    }
  }
)

/* =========================================================
   CREATE STORE ORDER
========================================================= */

router.post(
  "/",
  async (req, res) => {
    try {
      const {
        customerName,
        email,
        phone,
        address,
        items,

        shipping,
        shippingCost,
        shippingTotal,
        deliveryFee,

        shippingRate,
        shippingRateId,
        shippingProvider,
        shippingService,

        source,
        status
      } = req.body || {}

      if (!email) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Customer email is required"
          })
      }

      if (
        !Array.isArray(items) ||
        !items.length
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "No items provided"
          })
      }

      const requestedStatus =
        status ||
        "payment_required"

      if (
        !VALID_ORDER_STATUSES.includes(
          requestedStatus
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              `Invalid order status: ${requestedStatus}`
          })
      }

      const safeItems =
        items.map(
          (item) => {
            const rawPrice =
              item.finalPrice ??
              item.salePrice ??
              item.unitPrice ??
              item.price ??
              item.selectedVariant
                ?.price ??
              item.variant?.price ??
              item.basePrice ??
              item.listPrice ??
              0

            const price =
              safePositiveNumber(
                rawPrice,
                0
              )

            console.log(
              "🛒 ORDER ITEM:",
              {
                name:
                  item.name,

                rawPrice,

                parsedPrice:
                  price
              }
            )

            return {
              productId:
                item.productId ||
                item._id ||
                item.id ||
                item.product
                  ?._id ||
                null,

              name:
                String(
                  item.name ||
                  ""
                ).trim(),

              quantity:
                safeQuantity(
                  item.quantity,
                  1
                ),

              price,

              unitPrice:
                safePositiveNumber(
                  item.unitPrice,
                  price
                ),

              salePrice:
                safePositiveNumber(
                  item.salePrice,
                  price
                ),

              finalPrice:
                safePositiveNumber(
                  item.finalPrice,
                  price
                ),

              cost:
                safePositiveNumber(
                  item.cost,
                  0
                ),

              image:
                item.image ||
                item.imageUrl ||
                item.selectedVariant
                  ?.image ||
                "",

              productType:
                item.productType ||
                "physical",

              serviceType:
                item.serviceType ||
                "",

              source:
                item.source ||
                source ||
                "store",

              selectedVariant:
                item.selectedVariant ||
                null,

              variant:
                item.variant ||
                item.selectedVariant ||
                {}
            }
          }
        )

      const subtotal =
        roundMoney(
          safeItems.reduce(
            (
              sum,
              item
            ) =>
              sum +
              item.price *
              item.quantity,
            0
          )
        )

      const shippingRateAmount =
        shippingRate?.amount

      const selectedShipping =
        safePositiveNumber(
          shippingCost ??
          shipping ??
          shippingTotal ??
          deliveryFee ??
          shippingRateAmount,
          0
        )

      const tax =
        roundMoney(
          subtotal *
          TAX_RATE
        )

      const finalPrice =
        roundMoney(
          subtotal +
          tax +
          selectedShipping
        )

      console.log(
        "🚚 SHIPPING RECEIVED:",
        {
          shipping,
          shippingCost,
          shippingTotal,
          deliveryFee,
          shippingRate,
          selectedShipping
        }
      )

      console.log(
        "🧾 ORDER CREATE TOTALS:",
        {
          subtotal,
          tax,
          selectedShipping,
          finalPrice
        }
      )

      const order =
        await Order.create({
          customerName:
            String(
              customerName ||
              "Customer"
            ).trim(),

          email:
            normalizeEmail(
              email
            ),

          phone:
            String(
              phone ||
              ""
            ).trim(),

          address: {
            street:
              address?.street ||
              "",

            city:
              address?.city ||
              "",

            state:
              address?.state ||
              "",

            zip:
              address?.zip ||
              "",

            country:
              address?.country ||
              "US"
          },

          items:
            safeItems,

          subtotal,
          tax,

          shipping:
            selectedShipping,

          shippingCost:
            selectedShipping,

          shippingTotal:
            selectedShipping,

          deliveryFee:
            selectedShipping,

          shippingRate:
            shippingRate ||
            null,

          shippingRateId:
            shippingRateId ||
            shippingRate?.id ||
            shippingRate?.object_id ||
            shippingRate?.raw
              ?.object_id ||
            "",

          shippingProvider:
            shippingProvider ||
            shippingRate?.provider ||
            "",

          shippingService:
            shippingService ||
            getShippingService(
              shippingRate
            ),

          finalPrice,

          status:
            requestedStatus,

          source:
            source ||
            "store",

          timeline: [
            {
              status:
                requestedStatus,

              note:
                "Order created",

              date:
                new Date()
            }
          ]
        })

      console.log(
        "✅ CREATED ORDER SHIPPING:",
        {
          orderId:
            order._id,

          shipping:
            order.shipping,

          shippingCost:
            order.shippingCost,

          shippingTotal:
            order.shippingTotal,

          deliveryFee:
            order.deliveryFee,

          finalPrice:
            order.finalPrice
        }
      )

      emitOrderCreated(
        req,
        order
      )

      return res
        .status(201)
        .json({
          success: true,
          data: order
        })
    } catch (err) {
      console.error(
        "❌ ORDER CREATE ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,
          message:
            err.message
        })
    }
  }
)

/* =========================================================
   UPDATE ORDER
========================================================= */

router.patch(
  "/:id",
  async (req, res) => {
    try {
      const { id } =
        req.params

      if (
        !mongoose.Types.ObjectId
          .isValid(id)
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid order ID"
          })
      }

      const {
        status,
        finalPrice,
        note,

        customerName,
        email,
        phone,
        address,

        shipping,
        shippingCost,
        shippingTotal,
        deliveryFee,

        shippingRate,
        shippingRateId,
        shippingProvider,
        shippingService,

        paymentMethod,
        notes
      } = req.body || {}

      const order =
        await Order.findById(
          id
        )

      if (!order) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Order not found"
          })
      }

      if (
        !Array.isArray(
          order.timeline
        )
      ) {
        order.timeline = []
      }

      /* ================= CUSTOMER ================= */

      if (
        customerName !==
        undefined
      ) {
        order.customerName =
          String(
            customerName ||
            ""
          ).trim()
      }

      if (
        email !==
        undefined
      ) {
        order.email =
          normalizeEmail(
            email
          )
      }

      if (
        phone !==
        undefined
      ) {
        order.phone =
          String(
            phone ||
            ""
          ).trim()
      }

      if (
        address !==
        undefined
      ) {
        order.address = {
          street:
            address?.street ??
            order.address?.street ??
            "",

          city:
            address?.city ??
            order.address?.city ??
            "",

          state:
            address?.state ??
            order.address?.state ??
            "",

          zip:
            address?.zip ??
            order.address?.zip ??
            "",

          country:
            address?.country ??
            order.address?.country ??
            "US"
        }
      }

      /* ================= SHIPPING ================= */

      const hasShippingUpdate =
        shipping !== undefined ||
        shippingCost !== undefined ||
        shippingTotal !== undefined ||
        deliveryFee !== undefined ||
        shippingRate?.amount !==
          undefined

      if (hasShippingUpdate) {
        const selectedShipping =
          safePositiveNumber(
            shippingCost ??
            shipping ??
            shippingTotal ??
            deliveryFee ??
            shippingRate?.amount,
            order.shippingCost ??
            order.shipping ??
            0
          )

        order.shipping =
          selectedShipping

        order.shippingCost =
          selectedShipping

        order.shippingTotal =
          selectedShipping

        order.deliveryFee =
          selectedShipping
      }

      if (
        shippingRate !==
        undefined
      ) {
        order.shippingRate =
          shippingRate

        order.shippingRateId =
          shippingRateId ||
          shippingRate?.id ||
          shippingRate?.object_id ||
          shippingRate?.raw
            ?.object_id ||
          order.shippingRateId ||
          ""

        if (
          shippingProvider ===
          undefined
        ) {
          order.shippingProvider =
            shippingRate?.provider ||
            order.shippingProvider ||
            ""
        }

        if (
          shippingService ===
          undefined
        ) {
          order.shippingService =
            getShippingService(
              shippingRate,
              order.shippingService
            )
        }
      }

      if (
        shippingRateId !==
        undefined
      ) {
        order.shippingRateId =
          shippingRateId ||
          ""
      }

      if (
        shippingProvider !==
        undefined
      ) {
        order.shippingProvider =
          shippingProvider ||
          ""
      }

      if (
        shippingService !==
        undefined
      ) {
        order.shippingService =
          shippingService ||
          ""
      }

      /* ================= PRICE ================= */

      if (
        finalPrice !==
        undefined
      ) {
        order.finalPrice =
          roundMoney(
            safePositiveNumber(
              finalPrice,
              order.finalPrice ||
              0
            )
          )
      }

      /* ================= PAYMENT / NOTES ================= */

      if (
        paymentMethod !==
        undefined
      ) {
        order.paymentMethod =
          String(
            paymentMethod ||
            ""
          )
      }

      if (
        notes !==
        undefined
      ) {
        order.notes =
          String(
            notes ||
            ""
          )
      }

      /* ================= STATUS ================= */

      let statusChanged =
        false

      if (status) {
        if (
          !VALID_ORDER_STATUSES.includes(
            status
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                `Invalid order status: ${status}`,

              validStatuses:
                VALID_ORDER_STATUSES
            })
        }

        const previousStatus =
          order.status

        if (
          previousStatus !==
          status
        ) {
          order.status =
            status

          order.timeline.push({
            status,

            note:
              note ||
              `Order moved from ${previousStatus || "unknown"} to ${status}`,

            date:
              new Date()
          })

          statusChanged =
            true
        }
      }

      await order.save()

      emitOrderUpdate(
        req,
        order
      )

      /* ================= STATUS EMAIL ================= */

      if (
        statusChanged &&
        order.email
      ) {
        try {
          await sendOrderStatusEmail(
            order.email,
            order.status,
            order
          )
        } catch (emailError) {
          console.warn(
            "⚠️ ORDER STATUS EMAIL FAILED:",
            emailError.message
          )
        }
      }

      /* ================= INVOICE EMAIL ================= */

      if (
        statusChanged &&
        (
          status ===
            "payment_required" ||
          status ===
            "shipped"
        ) &&
        order.email
      ) {
        try {
          const invoicePath =
            await generateInvoice(
              order
            )

          await sendOrderStatusEmail(
            order.email,
            "invoice",
            order,
            invoicePath
          )
        } catch (
          invoiceError
        ) {
          console.warn(
            "⚠️ INVOICE GENERATION FAILED:",
            invoiceError.message
          )
        }
      }

      return res.json({
        success: true,
        data: order
      })
    } catch (err) {
      console.error(
        "❌ UPDATE ORDER ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,
          message:
            err.message
        })
    }
  }
)

/* =========================================================
   CHECKOUT
========================================================= */

router.patch(
  "/:id/checkout",
  async (req, res) => {
    try {
      const { id } =
        req.params

      if (
        !mongoose.Types.ObjectId
          .isValid(id)
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid order ID"
          })
      }

      const order =
        await Order.findById(
          id
        )

      if (!order) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Order not found"
          })
      }

      const baseUrl =
        process.env.SERVER_URL ||
        "https://signavi-backend.onrender.com"

      const response =
        await fetch(
          `${baseUrl}/api/square/create-payment/${order._id}`,
          {
            method: "POST"
          }
        )

      const data =
        await response.json()

      if (!response.ok) {
        console.error(
          "❌ SQUARE CHECKOUT RESPONSE:",
          data
        )

        return res
          .status(
            response.status ||
            500
          )
          .json({
            success: false,

            message:
              data?.message ||
              "Payment checkout failed"
          })
      }

      const paymentUrl =
        data?.paymentUrl ||
        data?.checkoutUrl ||
        data?.url

      if (!paymentUrl) {
        return res
          .status(500)
          .json({
            success: false,
            message:
              "Payment URL was not returned"
          })
      }

      if (
        !Array.isArray(
          order.timeline
        )
      ) {
        order.timeline = []
      }

      order.paymentUrl =
        paymentUrl

      const previousStatus =
        order.status

      order.status =
        "payment_required"

      if (
        previousStatus !==
        "payment_required"
      ) {
        order.timeline.push({
          status:
            "payment_required",

          note:
            "Payment checkout created",

          date:
            new Date()
        })
      }

      await order.save()

      emitOrderUpdate(
        req,
        order
      )

      if (order.email) {
        try {
          await sendOrderStatusEmail(
            order.email,
            "payment_required",
            order
          )
        } catch (
          emailError
        ) {
          console.warn(
            "⚠️ PAYMENT EMAIL FAILED:",
            emailError.message
          )
        }
      }

      return res.json({
        success: true,
        paymentUrl,
        orderId:
          order._id.toString()
      })
    } catch (err) {
      console.error(
        "❌ CHECKOUT ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,
          message:
            err.message
        })
    }
  }
)

/* =========================================================
   SHIP ORDER
========================================================= */

router.post(
  "/ship/:id",
  async (req, res) => {
    try {
      const { id } =
        req.params

      if (
        !mongoose.Types.ObjectId
          .isValid(id)
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid order ID"
          })
      }

      const order =
        await Order.findById(
          id
        )

      if (!order) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Order not found"
          })
      }

      if (
        !Array.isArray(
          order.timeline
        )
      ) {
        order.timeline = []
      }

      const previousStatus =
        order.status

      order.status =
        "shipped"

      if (
        previousStatus !==
        "shipped"
      ) {
        order.timeline.push({
          status:
            "shipped",

          note:
            "Order shipped",

          date:
            new Date()
        })
      }

      await order.save()

      emitOrderUpdate(
        req,
        order
      )

      if (order.email) {
        try {
          await sendOrderStatusEmail(
            order.email,
            "shipped",
            order
          )
        } catch (
          emailError
        ) {
          console.warn(
            "⚠️ SHIPPING EMAIL FAILED:",
            emailError.message
          )
        }
      }

      return res.json({
        success: true,
        data: order
      })
    } catch (err) {
      console.error(
        "❌ SHIP ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,
          message:
            err.message
        })
    }
  }
)

export default router