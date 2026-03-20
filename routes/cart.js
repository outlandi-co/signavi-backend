import express from "express"
import Cart from "../models/Cart.js"

const router = express.Router()

router.post("/save", async (req,res)=>{

  try{

    const { email, items } = req.body

    const cart = new Cart({
      email,
      items
    })

    await cart.save()

    res.json(cart)

  }catch(err){

    res.status(500).json({
      error:"Failed to save cart"
    })

  }

})

export default router