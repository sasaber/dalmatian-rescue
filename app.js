var paypal 		= require("paypal-rest-sdk"),
 	bodyParser 	= require("body-parser"),
	mongoose 	= require("mongoose"),
	express 	= require("express"),
	app 		= express();

// create cart object
var cart = {
	puppies: [], 
	totalQty: 0.0,
	totalPrice: 0.0,
	add: function(puppy, id){
		this.puppies.push(puppy);
		this.totalQty++;
		this.totalPrice += puppy.price;
	},
	reset: function(){
		this.puppies.length = 0;
		this.totalQty = 0.0;
		this.totalPrice = 0.0;
	},
	remove: function(puppy){
		for (var i = 0; i < this.puppies.length; i++){
			if(this.puppies[i].id === puppy.id)
				this.puppies.splice(i,1);
		}
		this.totalQty--;
		this.totalPrice -= puppy.price;
	}
};

// Reference to transactions array
var transactionsRef;

// PAYPAL CONFIG
paypal.configure({
  'mode': 'sandbox', //sandbox or live
  'client_id': 'xxxxxxx',
  'client_secret': 'xxxxxxx'
});

// APP CONFIG
mongoose.connect("mongodb://localhost/dal_paypal");
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended: true}));

// MONGOOSE/MODEL CONFIG
var puppySchema = new mongoose.Schema({
	name: String,
	image: String, 
	price: Number,
	description: String 
});

var Puppy = mongoose.model("Puppy", puppySchema);

/*Puppy.create({
	name: "Dotty",
	price: 25,
	description: "Save Dotty before he is turned into a coat!!",
	image: "https://c1.staticflickr.com/5/4072/4573769838_896aaa1825_b.jpg"
}, function(err, puppy){
	if(err)
		console.log(err);
	else 
		console.log(puppy);
})*/;

// ROUTES

app.get("/", function(req, res){
	res.redirect("/puppies");
})

// INDEX ROUTE
app.get("/puppies", function(req, res){
	// retrieve all puppies from db
	Puppy.find({}, function(err, foundPuppies){
		if(err)
			console.log(err);
		else
			res.render("index", {puppies: foundPuppies, cart: cart});
	});
});

// ADD TO CART ROUTE
app.get("/add-to-cart/:id", function(req, res){
	var puppyId = req.params.id;
	// retrieve puppy from db
	Puppy.findById(puppyId, function(err, foundPuppy){
		if(err){
			console.log(err);
			res.redirect("/");
		} else {
			// add puppy to cart
			cart.add(foundPuppy, foundPuppy.id);
			// redirect to index route
			res.redirect("/");
		}
	});
});

// REMOVE FROM CART ROUTE
app.get("/remove-from-cart/:id", function(req, res){
	var puppyId = req.params.id;
	Puppy.findById(puppyId, function(err, foundPuppy){
		if(err){
			console.log(err);
		} else {
			cart.remove(foundPuppy);
			res.render("cart", {cart: cart});
		}
	});
});

// SHOW CART ROUTE
app.get("/show-cart", function(req, res){
	res.render("cart", {cart: cart});
});

// CREATE PAYMENT ROUTE
app.post("/paypal/create-payment", function(req, res){
	// CREATE JSON REQUEST 
	var create_payment_json = {
		"intent": "sale",
	  "redirect_urls":
	  {
	    "return_url": "https://localhost:3000/success",
	    "cancel_url": "https://localhost:3000/cancel"
	  },
	  "payer":
	  {
	    "payment_method": "paypal"
	  },
	  "transactions": [
	  {
	    "amount":
	    {
	      "total": "",
	      "currency": "USD",
	      "details":{
	      	"subtotal": "",
	        "shipping": "0.00",
	        "tax": "0.00",
	        "shipping_discount": "0.00"
	      }
	    },
	    "item_list":
	    {
	      "items": []
	    },
	    "description": "Test shopping cart transaction."
	  }]
	};

	// Change the "total", "subtotal", and "items" array in the json request
	create_payment_json["transactions"][0]["amount"]["total"] = cart.totalPrice.toString();
	create_payment_json["transactions"][0]["amount"]["details"]["subtotal"] = cart.totalPrice.toString();

	// Dummy variable for less typing 
	var itemsArray = create_payment_json["transactions"][0]["item_list"]["items"];
	
	// 1) Access each puppy in the cart
	// 2) Create an object with the following properties:
	// 			quantity, name, price, currency, description, and tax
	// 3) push that object into itemsArray
	 cart["puppies"].forEach(function(puppy){
	 	var dummy = {
	 		"quantity" : "1",
	 		"name" : puppy.name,
	 		"price" : puppy.price.toString(),
	 		"currency" : "USD",
	 		"description" : puppy.description,
	 		"tax" : "0"
	 	};
	 	itemsArray.push(dummy);
	 });

	// Update reference to transactions array
	transactionsRef = create_payment_json["transactions"];

	// Send a Create Payment request to the Payments API
	paypal.payment.create(create_payment_json, function (error, payment){
	    if (error) {
	      console.log(error);
	    } else {
	    	console.log(JSON.stringify(payment));
	    	console.log("==============");
	    	var payment_response_json = {
	    		"id": payment.id
	    	};
	    	console.log(JSON.stringify(payment_response_json));

	    	return res.json(payment_response_json); 
	    }
	});
});

// EXECUTE PAYMENT ROUTE 
app.post("/paypal/execute-payment", function(req, res){
	var paymentId = req.body.paymentID;

	var execute_payment_json = {
	    "payer_id": req.body.payerID,
	    "transactions": transactionsRef
	};

	paypal.payment.execute(paymentId, execute_payment_json, function(error, payment){
		if (error){
			console.log(error);
		} else {
			if(payment.state === "approved"){
				console.log(payment);
				cart.reset();
				res.send("SUCCESS");
			} else {
				console.log("payment not successful");
			}
		}
	});

});

// PAYMENT SUCCESS ROUTE
app.get("/success", function(req, res){
	res.redirect("/puppies");
});

// PAYMENT CANCEL ROUTE
app.get("/cancel", function(req, res){
	res.send("CANCELLED!");
});

app.listen(3000, function(){
	console.log("THE SERVER HAS STARTED!");
});