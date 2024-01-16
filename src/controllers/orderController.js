const Customer = require('../models/Customer');
const DetailOrder = require('../models/DetailOrder');
const Order = require('../models/Order');
const Product = require('../models/Product');

// [GET] api/order
const read = async (req, res, next) => {
    try {
        let orders;
        orders = await Order.aggregate([
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customer',
                    foreignField: '_id',
                    as: 'customer',
                },
            },
            {
                $unwind: '$customer',
            },
            { $match: req.filters },
            { $sort: req.sorts },
        ]);
        return res.status(200).json({ success: true, orders });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, status: 500, message: 'Internal server error' });
    }
};

// Create detail
const createDetail = ({ orderObject, detailObjs }) => {
    const createDetailPromises = [];

    detailObjs.forEach((detailObj) => {
        const totalPrice = detailObj.price * detailObj.quantity;
        const newDetailOrder = new DetailOrder({
            ...detailObj,
            order: orderObject._id,
            totalPrice,
        });
        const savePromise = new Promise(async (resolve, reject) => {
            try {
                await newDetailOrder.save();
                resolve(newDetailOrder);
            } catch (error) {
                console.log(error);
                reject();
            }
        });
        createDetailPromises.push(savePromise);
    });

    return new Promise((resolve, reject) => {
        Promise.all(createDetailPromises)
            .then((newDetails) => resolve(newDetails))
            .catch(() => reject());
    });
};
// Create detail
const updateProductQuantity = (detailObjs) => {
    const updateQuantityPromises = [];

    detailObjs.forEach((detailObj) => {
        const updatePromise = new Promise(async (resolve, reject) => {
            try {
                const product = await Product.findById(detailObj.product);
                let newQuanity = product.toObject().quantity - detailObj.quantity;
                if (newQuanity < 0) {
                    newQuanity = 0;
                }

                const newProduct = await Product.findOneAndUpdate(
                    { _id: detailObj.product },
                    { quantity: newQuanity },
                    {
                        new: true,
                    }
                );
                resolve(newProduct);
            } catch (error) {
                console.log(error);
                reject();
            }
        });

        updateQuantityPromises.push(updatePromise);
    });

    return new Promise((resolve, reject) => {
        Promise.all(updateQuantityPromises)
            .then((newProduct) => resolve(newProduct))
            .catch(() => reject());
    });
};

// [POST] api/order
const create = async (req, res, next) => {
    const { customer, status, details, receivedMoney, totalPrice, exchangeMoney, discount } = req.body;

    // Validate field
    if (!customer || !receivedMoney || !totalPrice || !exchangeMoney) {
        return res.status(400).json({ success: false, status: 400, message: 'Missed field' });
    }

    // Check and create customer
    const customerInDB = await Customer.findById(customer._id);
    let customerId;
    if (customerInDB) {
        // Have customer in db
        customerId = customerInDB._id;
    } else {
        //Don't have customer in db
        if (!customer.name || !customer.address || !customer.phone) {
            return res.status(400).json({ success: false, status: 400, message: 'Missed field' });
        }
        try {
            const newCustomer = new Customer({
                name: customer.name,
                address: customer.address,
                phone: customer.phone,
            });
            await newCustomer.save();
            customerId = newCustomer._id;
        } catch (err) {
            console.log(err);
            return res.status(500).json({ success: false, status: 500, message: 'Internal server error' });
        }
    }

    // Create order
    let newOrder;
    try {
        newOrder = new Order({
            customer: customerId,
            status: status || 'pending',
            receivedMoney,
            totalPrice,
            exchangeMoney,
            discount,
        });
        await newOrder.save();
    } catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, status: 500, message: 'Internal server error' });
    }

    // Create detail order
    let newDetailOrders;
    try {
        newDetailOrders = await createDetail({ orderObject: newOrder, detailObjs: details });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, status: 500, message: 'Internal server error' });
    }

    // update quantity
    try {
        await updateProductQuantity(details);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, status: 500, message: 'Internal server error' });
    }

    // Get order and response
    try {
        const updatedOrder = await Order.findOne({ id: newOrder.toObject().id });
        return res.status(200).json({
            success: true,
            orders: {
                ...updatedOrder.toObject(),
                details: newDetailOrders,
            },
        });
    } catch (error) {}
};

// [GET] api/order/:id
const readOne = async (req, res, next) => {
    const id = req.params.id;
    try {
        let order;
        order = await Order.findOne({ id }).populate('customer');
        return res.status(200).json({ success: true, order });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, status: 500, message: 'Internal server error' });
    }
};

// [PUT] api/order/:id
const update = async (req, res, next) => {
    const id = Number(req.params.id);
    const bodyObj = req.body;
    const updateObj = {};

    Object.keys(bodyObj).forEach((key) => {
        if (bodyObj[key] !== undefined) {
            updateObj[key] = bodyObj[key];
        }
    });

    // Update order
    try {
        const newOrder = await Order.findOneAndUpdate({ id }, updateObj, {
            new: true,
        });
        return res.status(200).json({ success: true, order: newOrder });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, status: 500, message: 'Internal server error' });
    }
};

// // [DELETE] api/order/:id
// const destroy = async (req, res, next) => {
//     if (!req.params.id) {
//         return res.status(400).json({ success: false, status: 400, message: 'Missed id' });
//     }

//     try {
//         await Order.delete({ id: req.params.id });
//         return res.status(200).json({ success: true });
//     } catch (err) {
//         console.log(err);
//         return res.status(500).json({ success: false, status: 500, message: 'Internal server error' });
//     }
// };

//[DELETE] api / order /: id
const destroy = async (req, res, next) => {
    const orderId = req.params.id;
    if (!orderId) {
        return res.status(400).json({ success: false, status: 400, message: 'Missed id' });
    }

    try {
        console.log("bbbbbbbbbbbbbbbbbbbbbbbbbbbbb" + orderId)
        // Truy xuất chi tiết đơn hàng
        const orderDetails = await DetailOrder.find({ id: orderId });

        // Chuẩn bị dữ liệu để cập nhật số lượng sản phẩm
        const updateQuantityTasks = orderDetails.map(detail => ({
            product: detail.product,
            quantity: detail.quantity // Số lượng để trả lại
        }));
        console.log("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        console.log(updateQuantityTasks);
        // Cập nhật số lượng sản phẩm
        await restoreProductQuantity(updateQuantityTasks);

        // Xóa đơn hàng
        await Order.delete({ _id: orderId });
        return res.status(200).json({ success: true });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, status: 500, message: 'Internal server error' });
    }
};

//Hàm để trả lại số lượng sản phẩm
// const restoreProductQuantity = async (detailObjs) => {
//     const tasks = detailObjs.map(async ({ product, quantity }) => {
//         console.log("cccccccccccccccccccc: " + product + "|||cccccccc: " + quantity)
//         if (mongoose.Types.ObjectId.isValid(product)) {
//             console.log('checkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk Valid ObjectId');
//           } else {
//             console.log('nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn Invalid ObjectId');
//           }
//         return Product.findByIdAndUpdate(product, { quantity: quantity } , { new: true });
//     });

//     return Promise.all(tasks).catch((error) => {
//         console.log('Error in restoring product quantity:', error);
//         // Xử lý thêm tùy theo nhu cầu
//     });
// };

const restoreProductQuantity = async (detailObjs) => {
    const tasks = detailObjs.map(async ({ product, quantity }) => {
        console.log("cccccccccccccccccccc: " + product + "|||cccccccc: " + quantity)
        
        const existingProduct = await Product.findOne({product});
        console.log("ccccccccccccccccc" + existingProduct)

        if (existingProduct) {
            // Cộng thêm số lượng đã bán vào số lượng hiện tại

            console.log("aaaaaaaaaaaaaa" + existingProduct.quantity)
            const newQuantity = existingProduct.quantity + quantity;
            return Product.findByIdAndUpdate(product, { quantity: newQuantity }, { new: true });
        }
    });

    return Promise.all(tasks);
};

module.exports = { read, create, readOne, update, destroy };

