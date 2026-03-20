import Cart from "../models/Cart.js"
import { sendCartReminderEmail } from "../utils/emailService.js"

export const runCartRecovery = async ()=>{

  const oneHourAgo = new Date(Date.now() - 60*60*1000)

  const carts = await Cart.find({
    recovered:false,
    createdAt:{ $lte: oneHourAgo }
  })

  for(const cart of carts){

    await sendCartReminderEmail(cart.email, cart.items)

    cart.recovered = true
    await cart.save()

  }

}