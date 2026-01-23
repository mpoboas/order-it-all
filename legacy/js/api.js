// PocketBase API integration for Order It All!

// Initialize PocketBase
const pb = new PocketBase('https://pb-orderit.povoas.top');

// API class for all database operations
const API = {
    // Trip operations
    trips: {
        // Get all open trips
        getOpen: async () => {
            try {
                const records = await pb.collection('trips').getFullList({
                    filter: 'status = "open"',
                    sort: '-created'
                });
                return records;
            } catch (error) {
                console.error('Error fetching open trips:', error);
                throw error;
            }
        },
        
        // Get all trips (open and closed)
        getAll: async () => {
            try {
                const records = await pb.collection('trips').getFullList({
                    sort: '-created'
                });
                return records;
            } catch (error) {
                console.error('Error fetching all trips:', error);
                throw error;
            }
        },
        
        // Get closed trips
        getClosed: async () => {
            try {
                const records = await pb.collection('trips').getFullList({
                    filter: 'status = "closed"',
                    sort: '-updated'
                });
                return records;
            } catch (error) {
                console.error('Error fetching closed trips:', error);
                throw error;
            }
        },
        
        // Get trip by ID
        getById: async (tripId) => {
            try {
                const record = await pb.collection('trips').getOne(tripId);
                return record;
            } catch (error) {
                console.error('Error fetching trip:', error);
                throw error;
            }
        },
        
        // Create new trip
        create: async (tripData) => {
            try {
                const record = await pb.collection('trips').create({
                    name: tripData.name,
                    description: tripData.description || '',
                    status: 'open',
                    created_by: tripData.created_by || 'admin'
                });
                return record;
            } catch (error) {
                console.error('Error creating trip:', error);
                throw error;
            }
        },
        
        // Update trip
        update: async (tripId, tripData) => {
            try {
                const record = await pb.collection('trips').update(tripId, tripData);
                return record;
            } catch (error) {
                console.error('Error updating trip:', error);
                throw error;
            }
        },
        
        // Delete trip
        delete: async (tripId) => {
            try {
                await pb.collection('trips').delete(tripId);
                return true;
            } catch (error) {
                console.error('Error deleting trip:', error);
                throw error;
            }
        },
        
        // Close trip
        close: async (tripId) => {
            try {
                const record = await pb.collection('trips').update(tripId, {
                    status: 'closed'
                });
                return record;
            } catch (error) {
                console.error('Error closing trip:', error);
                throw error;
            }
        }
    },
    
    // Order operations
    orders: {
        // Get orders for a trip
        getByTrip: async (tripId) => {
            try {
                const records = await pb.collection('orders').getFullList({
                    filter: `trip_id = "${tripId}"`,
                    sort: '-created'
                });
                return records;
            } catch (error) {
                console.error('Error fetching orders:', error);
                throw error;
            }
        },
        
        // Get order by ID
        getById: async (orderId) => {
            try {
                const record = await pb.collection('orders').getOne(orderId);
                return record;
            } catch (error) {
                console.error('Error fetching order:', error);
                throw error;
            }
        },
        
        // Create new order
        create: async (orderData) => {
            try {
                const record = await pb.collection('orders').create({
                    trip_id: orderData.trip_id,
                    user_name: orderData.user_name,
                    can_edit_until: orderData.can_edit_until || new Date(Date.now() + 5 * 60 * 1000).toISOString()
                });
                return record;
            } catch (error) {
                console.error('Error creating order:', error);
                throw error;
            }
        },
        
        // Update order
        update: async (orderId, orderData) => {
            try {
                const record = await pb.collection('orders').update(orderId, orderData);
                return record;
            } catch (error) {
                console.error('Error updating order:', error);
                throw error;
            }
        },
        
        // Delete order
        delete: async (orderId) => {
            try {
                await pb.collection('orders').delete(orderId);
                return true;
            } catch (error) {
                console.error('Error deleting order:', error);
                throw error;
            }
        }
    },
    
    // Item operations
    items: {
        // Get items for an order
        getByOrder: async (orderId) => {
            try {
                const records = await pb.collection('items').getFullList({
                    filter: `order_id = "${orderId}"`,
                    sort: 'created'
                });
                return records;
            } catch (error) {
                console.error('Error fetching items:', error);
                throw error;
            }
        },
        
        // Get item by ID
        getById: async (itemId) => {
            try {
                const record = await pb.collection('items').getOne(itemId);
                return record;
            } catch (error) {
                console.error('Error fetching item:', error);
                throw error;
            }
        },
        
        // Create new item
        create: async (itemData) => {
            try {
                const record = await pb.collection('items').create({
                    order_id: itemData.order_id,
                    name: itemData.name,
                    quantity: parseInt(itemData.quantity),
                    brand: itemData.brand || '',
                    notes: itemData.notes || '',
                    found_status: 'pending',
                    price: itemData.price || 0
                });
                return record;
            } catch (error) {
                console.error('Error creating item:', error);
                throw error;
            }
        },
        
        // Update item
        update: async (itemId, itemData) => {
            try {
                const updateData = { ...itemData };
                if (itemData.quantity) {
                    updateData.quantity = parseInt(itemData.quantity);
                }
                if (itemData.price !== undefined) {
                    updateData.price = parseFloat(itemData.price);
                }
                
                const record = await pb.collection('items').update(itemId, updateData);
                return record;
            } catch (error) {
                console.error('Error updating item:', error);
                throw error;
            }
        },
        
        // Delete item
        delete: async (itemId) => {
            try {
                await pb.collection('items').delete(itemId);
                return true;
            } catch (error) {
                console.error('Error deleting item:', error);
                throw error;
            }
        },
        
        // Update found status
        updateFoundStatus: async (itemId, status) => {
            try {
                const record = await pb.collection('items').update(itemId, {
                    found_status: status
                });
                return record;
            } catch (error) {
                console.error('Error updating found status:', error);
                throw error;
            }
        },
        
        // Update price
        updatePrice: async (itemId, price) => {
            try {
                const record = await pb.collection('items').update(itemId, {
                    price: parseFloat(price)
                });
                return record;
            } catch (error) {
                console.error('Error updating price:', error);
                throw error;
            }
        }
    },
    
    // Real-time subscriptions
    subscriptions: {
        // Subscribe to trips changes
        subscribeToTrips: (callback) => {
            return pb.collection('trips').subscribe('*', callback);
        },
        
        // Subscribe to orders changes for a trip
        subscribeToOrders: (tripId, callback) => {
            return pb.collection('orders').subscribe(`trip_id = "${tripId}"`, callback);
        },
        
        // Subscribe to items changes for an order
        subscribeToItems: (orderId, callback) => {
            return pb.collection('items').subscribe(`order_id = "${orderId}"`, callback);
        },
        
        // Unsubscribe from all subscriptions
        unsubscribe: () => {
            pb.collection('trips').unsubscribe();
            pb.collection('orders').unsubscribe();
            pb.collection('items').unsubscribe();
        }
    },
    
    // Utility methods
    utils: {
        // Check if user is admin (hardcoded for now)
        isAdmin: () => {
            // In a real app, this would check authentication
            // For now, we'll use a simple check
            return window.location.pathname.includes('admin');
        },
        
        // Get current user name
        getCurrentUser: () => {
            return Utils.Storage.getUserName();
        },
        
        // Validate trip data
        validateTrip: (tripData) => {
            const errors = [];
            if (!tripData.name || tripData.name.trim().length === 0) {
                errors.push('Trip name is required');
            }
            return errors;
        },
        
        // Validate order data
        validateOrder: (orderData) => {
            const errors = [];
            if (!orderData.user_name || orderData.user_name.trim().length === 0) {
                errors.push('User name is required');
            }
            if (!orderData.trip_id) {
                errors.push('Trip ID is required');
            }
            return errors;
        },
        
        // Validate item data
        validateItem: (itemData) => {
            const errors = [];
            if (!itemData.name || itemData.name.trim().length === 0) {
                errors.push('Item name is required');
            }
            if (!Utils.Validation.isValidQuantity(itemData.quantity)) {
                errors.push('Quantity must be a positive number');
            }
            if (itemData.price && !Utils.Validation.isValidPrice(itemData.price)) {
                errors.push('Price must be a non-negative number');
            }
            return errors;
        }
    }
};

// Export API for use in other modules
window.API = API; 