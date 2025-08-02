// Main application logic for Order It All!

// App state management
const AppState = {
    currentUser: '',
    currentTrip: null,
    currentPage: 'welcome',
    trips: [],
    orders: [],
    items: [],
    subscriptions: []
};

// Page management
const PageManager = {
    // Show a specific page
    show: (pageName) => {
        // Hide all pages
        document.querySelectorAll('[id$="-page"], #welcome-screen').forEach(page => {
            page.classList.add('hidden');
        });
        
        // Show requested page
        const pageElement = document.getElementById(`${pageName}-page`) || document.getElementById('welcome-screen');
        if (pageElement) {
            pageElement.classList.remove('hidden');
            AppState.currentPage = pageName;
        }
    },
    
    // Initialize page navigation
    init: () => {
        // Navigation links
        document.querySelectorAll('[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = e.target.getAttribute('data-page');
                PageManager.show(page);
                
                // Load page-specific data
                if (page === 'trips') {
                    TripManager.loadTrips();
                } else if (page === 'profile') {
                    ProfileManager.loadProfile();
                }
            });
        });
        
        // Back button
        document.getElementById('back-to-trips')?.addEventListener('click', () => {
            PageManager.show('trips');
            AppState.currentTrip = null;
        });
    }
};

// User management
const UserManager = {
    // Initialize user session
    init: () => {
        const userName = Utils.Storage.getUserName();
        if (userName) {
            AppState.currentUser = userName;
            UserManager.updateUI();
            PageManager.show('trips');
        } else {
            PageManager.show('welcome');
        }
    },
    
    // Set user name
    setUser: (name) => {
        const sanitizedName = Utils.StringUtils.sanitize(name.trim());
        if (sanitizedName) {
            Utils.Storage.setUserName(sanitizedName);
            AppState.currentUser = sanitizedName;
            UserManager.updateUI();
            Utils.Toast.success(`Welcome, ${sanitizedName}!`);
            return true;
        }
        return false;
    },
    
    // Update UI with user info
    updateUI: () => {
        const initial = Utils.StringUtils.getInitials(AppState.currentUser);
        document.getElementById('user-initial').textContent = initial;
        
        // Update profile page
        const profileNameInput = document.getElementById('profile-name');
        if (profileNameInput) {
            profileNameInput.value = AppState.currentUser;
        }
    },
    
    // Logout user
    logout: () => {
        Utils.Storage.clearUser();
        AppState.currentUser = '';
        PageManager.show('welcome');
        Utils.Toast.info('Logged out successfully');
    },
    
    // Initialize event listeners
    initEvents: () => {
        // Start button
        document.getElementById('start-btn')?.addEventListener('click', () => {
            const nameInput = document.getElementById('user-name-input');
            const name = nameInput.value.trim();
            
            if (UserManager.setUser(name)) {
                PageManager.show('trips');
                nameInput.value = '';
            } else {
                Utils.Toast.error('Please enter a valid name');
            }
        });
        
        // Logout button
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            UserManager.logout();
        });
        
        // Enter key on name input
        document.getElementById('user-name-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('start-btn').click();
            }
        });
    }
};

// Trip management
const TripManager = {
    // Load and display trips
    loadTrips: async () => {
        try {
            Utils.DOM.show('#loading-screen');
            const trips = await API.trips.getOpen();
            AppState.trips = trips;
            TripManager.renderTrips();
        } catch (error) {
            Utils.Toast.error('Failed to load trips');
            console.error('Error loading trips:', error);
        } finally {
            Utils.DOM.hide('#loading-screen');
        }
    },
    
    // Render trips list
    renderTrips: () => {
        const tripsList = document.getElementById('trips-list');
        const noTrips = document.getElementById('no-trips');
        
        if (!tripsList) return;
        
        if (AppState.trips.length === 0) {
            tripsList.innerHTML = '';
            noTrips.classList.remove('hidden');
            return;
        }
        
        noTrips.classList.add('hidden');
        tripsList.innerHTML = AppState.trips.map(trip => `
            <div class="card trip-card bg-base-100 shadow-xl" data-trip-id="${trip.id}">
                <div class="card-body">
                    <div class="flex justify-between items-start">
                        <div>
                            <h2 class="card-title">${Utils.StringUtils.sanitize(trip.name)}</h2>
                            <p class="text-base-content/70">${Utils.StringUtils.sanitize(trip.description || 'No description')}</p>
                            <p class="text-sm text-base-content/50">Created ${Utils.DateTime.getRelativeTime(trip.created)}</p>
                        </div>
                        <div class="badge status-open">Open</div>
                    </div>
                    <div class="card-actions justify-end mt-4">
                        <button class="btn btn-primary btn-sm" onclick="TripManager.openTrip('${trip.id}')">
                            View Orders
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    },
    
    // Open a specific trip
    openTrip: async (tripId) => {
        try {
            const trip = await API.trips.getById(tripId);
            AppState.currentTrip = trip;
            Utils.Storage.setCurrentTripId(tripId);
            
            // Update trip detail page
            document.getElementById('trip-name').textContent = Utils.StringUtils.sanitize(trip.name);
            document.getElementById('trip-description').textContent = Utils.StringUtils.sanitize(trip.description || 'No description');
            document.getElementById('trip-status').textContent = trip.status === 'open' ? 'Open' : 'Closed';
            document.getElementById('trip-status').className = `badge ${trip.status === 'open' ? 'status-open' : 'status-closed'}`;
            
            // Show/hide add order button based on trip status
            const addOrderBtn = document.getElementById('add-order-btn');
            if (addOrderBtn) {
                addOrderBtn.style.display = trip.status === 'open' ? 'block' : 'none';
            }
            
            PageManager.show('trip-detail');
            OrderManager.loadOrders(tripId);
        } catch (error) {
            Utils.Toast.error('Failed to load trip details');
            console.error('Error loading trip:', error);
        }
    },
    
    // Initialize event listeners
    initEvents: () => {
        // Refresh trips button
        document.getElementById('refresh-trips')?.addEventListener('click', () => {
            TripManager.loadTrips();
        });
    }
};

// Order management
const OrderManager = {
    // Load orders for a trip
    loadOrders: async (tripId) => {
        try {
            const orders = await API.orders.getByTrip(tripId);
            AppState.orders = orders;
            OrderManager.renderOrders();
            
            // Load items for each order
            for (const order of orders) {
                await OrderManager.loadItems(order.id);
            }
        } catch (error) {
            Utils.Toast.error('Failed to load orders');
            console.error('Error loading orders:', error);
        }
    },
    
    // Load items for an order
    loadItems: async (orderId) => {
        try {
            const items = await API.items.getByOrder(orderId);
            AppState.items = AppState.items.filter(item => item.order_id !== orderId);
            AppState.items.push(...items);
            OrderManager.renderOrders(); // Re-render to show items
        } catch (error) {
            console.error('Error loading items:', error);
        }
    },
    
    // Render orders list
    renderOrders: () => {
        const ordersList = document.getElementById('orders-list');
        if (!ordersList) return;
        
        if (AppState.orders.length === 0) {
            ordersList.innerHTML = `
                <div class="text-center py-8">
                    <div class="text-4xl mb-4">📝</div>
                    <h3 class="text-xl font-semibold mb-2">No Orders Yet</h3>
                    <p class="text-base-content/70">Be the first to add an order!</p>
                </div>
            `;
            return;
        }
        
        ordersList.innerHTML = AppState.orders.map(order => {
            const orderItems = AppState.items.filter(item => item.order_id === order.id);
            const isEditable = Utils.Timer.isOrderEditable(order.id);
            const canEdit = isEditable || API.utils.isAdmin();
            
            return `
                <div class="card bg-base-100 shadow-lg">
                    <div class="card-body">
                        <div class="flex justify-between items-start mb-4">
                            <div class="flex items-center gap-3">
                                <div class="user-avatar">
                                    ${Utils.StringUtils.getInitials(order.user_name)}
                                </div>
                                <div>
                                    <h3 class="font-semibold">${Utils.StringUtils.sanitize(order.user_name)}</h3>
                                    <p class="text-sm text-base-content/50">${Utils.DateTime.getRelativeTime(order.created)}</p>
                                </div>
                            </div>
                            <div class="flex gap-2">
                                ${canEdit ? `
                                    <button class="btn btn-ghost btn-sm" onclick="OrderManager.editOrder('${order.id}')">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                        </svg>
                                    </button>
                                ` : ''}
                                ${isEditable ? `
                                    <div class="edit-timer ${Utils.Timer.getRemainingEditTime(order.id) < 60 ? 'warning' : ''}">
                                        ${Utils.Timer.formatTime(Utils.Timer.getRemainingEditTime(order.id))}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                        
                        <div class="space-y-2">
                            ${orderItems.map(item => `
                                <div class="flex justify-between items-center p-3 bg-base-200 rounded-lg">
                                    <div class="flex-1">
                                        <div class="font-medium">${Utils.StringUtils.sanitize(item.name)}</div>
                                        <div class="text-sm text-base-content/70">
                                            ${item.quantity} ${item.brand ? `(${Utils.StringUtils.sanitize(item.brand)})` : ''}
                                            ${item.notes ? `- ${Utils.StringUtils.sanitize(item.notes)}` : ''}
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <div class="badge found-status-${item.found_status}">
                                            ${Utils.StringUtils.capitalize(item.found_status)}
                                        </div>
                                        ${item.price > 0 ? `
                                            <div class="price-display">
                                                ${Utils.Validation.formatCurrency(item.price)}
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    // Create new order
    createOrder: async (orderData) => {
        try {
            const order = await API.orders.create(orderData);
            Utils.Timer.startEditTimer(order.id);
            
            // Create items for the order
            for (const item of orderData.items) {
                await API.items.create({
                    ...item,
                    order_id: order.id
                });
            }
            
            Utils.Toast.success('Order created successfully!');
            OrderManager.loadOrders(AppState.currentTrip.id);
            
            // Close modal
            const modal = document.getElementById('order-modal');
            if (modal) modal.close();
            
        } catch (error) {
            Utils.Toast.error('Failed to create order');
            console.error('Error creating order:', error);
        }
    },
    
    // Edit order (placeholder for future implementation)
    editOrder: (orderId) => {
        Utils.Toast.info('Edit functionality coming soon!');
    },
    
    // Initialize event listeners
    initEvents: () => {
        // Add order button
        document.getElementById('add-order-btn')?.addEventListener('click', () => {
            OrderFormManager.openModal();
        });
        
        // Order form submission
        document.getElementById('order-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            OrderFormManager.submitOrder();
        });
        
        // Cancel order button
        document.getElementById('cancel-order')?.addEventListener('click', () => {
            const modal = document.getElementById('order-modal');
            if (modal) modal.close();
        });
    }
};

// Order form management
const OrderFormManager = {
    // Open the order modal
    openModal: () => {
        const modal = document.getElementById('order-modal');
        const userNameInput = document.getElementById('order-user-name');
        
        if (modal && userNameInput) {
            userNameInput.value = AppState.currentUser;
            modal.showModal();
        }
    },
    
    // Submit the order form
    submitOrder: () => {
        const form = document.getElementById('order-form');
        const formData = new FormData(form);
        
        // Collect items from the form
        const items = [];
        document.querySelectorAll('.order-item').forEach((itemElement, index) => {
            const name = itemElement.querySelector('.item-name').value.trim();
            const quantity = itemElement.querySelector('.item-quantity').value;
            const brand = itemElement.querySelector('.item-brand').value.trim();
            const notes = itemElement.querySelector('.item-notes').value.trim();
            
            if (name && quantity) {
                items.push({
                    name,
                    quantity: parseFloat(quantity),
                    brand,
                    notes
                });
            }
        });
        
        if (items.length === 0) {
            Utils.Toast.error('Please add at least one item');
            return;
        }
        
        const orderData = {
            trip_id: AppState.currentTrip.id,
            user_name: formData.get('order-user-name') || AppState.currentUser,
            items
        };
        
        OrderManager.createOrder(orderData);
    },
    
    // Add new item to the form
    addItem: () => {
        const itemsContainer = document.getElementById('order-items');
        const newItem = document.createElement('div');
        newItem.className = 'order-item border rounded-lg p-4';
        newItem.innerHTML = `
            <div class="grid grid-cols-2 gap-2 mb-2">
                <div class="form-control">
                    <label class="label">
                        <span class="label-text">Item Name</span>
                    </label>
                    <input type="text" class="input input-bordered item-name" required />
                </div>
                <div class="form-control">
                    <label class="label">
                        <span class="label-text">Quantity</span>
                    </label>
                    <input type="number" min="0.01" step="0.01" class="input input-bordered item-quantity" required />
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div class="form-control">
                    <label class="label">
                        <span class="label-text">Brand (optional)</span>
                    </label>
                    <input type="text" class="input input-bordered item-brand" />
                </div>
                <div class="form-control">
                    <label class="label">
                        <span class="label-text">Notes (optional)</span>
                    </label>
                    <input type="text" class="input input-bordered item-notes" />
                </div>
            </div>
            <button type="button" class="btn btn-ghost btn-sm mt-2" onclick="this.parentElement.remove()">
                Remove Item
            </button>
        `;
        itemsContainer.appendChild(newItem);
    },
    
    // Initialize event listeners
    initEvents: () => {
        // Add item button
        document.getElementById('add-item-btn')?.addEventListener('click', () => {
            OrderFormManager.addItem();
        });
    }
};

// Profile management
const ProfileManager = {
    // Load profile data
    loadProfile: () => {
        const nameInput = document.getElementById('profile-name');
        if (nameInput) {
            nameInput.value = AppState.currentUser;
        }
    },
    
    // Save profile changes
    saveProfile: () => {
        const nameInput = document.getElementById('profile-name');
        const newName = nameInput.value.trim();
        
        if (UserManager.setUser(newName)) {
            Utils.Toast.success('Profile updated successfully!');
        } else {
            Utils.Toast.error('Please enter a valid name');
        }
    },
    
    // Initialize event listeners
    initEvents: () => {
        // Save profile button
        document.getElementById('save-profile')?.addEventListener('click', () => {
            ProfileManager.saveProfile();
        });
    }
};

// Real-time updates
const RealTimeManager = {
    // Initialize real-time subscriptions
    init: () => {
        // Subscribe to trips changes
        API.subscriptions.subscribeToTrips((e) => {
            if (AppState.currentPage === 'trips') {
                TripManager.loadTrips();
            }
        });
        
        // Subscribe to orders changes for current trip
        if (AppState.currentTrip) {
            API.subscriptions.subscribeToOrders(AppState.currentTrip.id, (e) => {
                if (AppState.currentPage === 'trip-detail') {
                    OrderManager.loadOrders(AppState.currentTrip.id);
                }
            });
        }
    },
    
    // Cleanup subscriptions
    cleanup: () => {
        API.subscriptions.unsubscribe();
    }
};

// Timer management for edit timers
const TimerManager = {
    // Update edit timers
    updateTimers: () => {
        AppState.orders.forEach(order => {
            if (Utils.Timer.isOrderEditable(order.id)) {
                const timerElement = document.querySelector(`[data-order-id="${order.id}"] .edit-timer`);
                if (timerElement) {
                    const remaining = Utils.Timer.getRemainingEditTime(order.id);
                    timerElement.textContent = Utils.Timer.formatTime(remaining);
                    timerElement.classList.toggle('warning', remaining < 60);
                }
            }
        });
    },
    
    // Start timer updates
    start: () => {
        setInterval(() => {
            TimerManager.updateTimers();
        }, 1000);
    }
};

// App initialization
const App = {
    // Initialize the application
    init: () => {
        // Hide loading screen and show app
        Utils.DOM.hide('#loading-screen');
        Utils.DOM.show('#app');
        
        // Initialize all managers
        PageManager.init();
        UserManager.init();
        UserManager.initEvents();
        TripManager.initEvents();
        OrderManager.initEvents();
        OrderFormManager.initEvents();
        ProfileManager.initEvents();
        
        // Start timer updates
        TimerManager.start();
        
        // Initialize real-time updates
        RealTimeManager.init();
        
        console.log('Order It All! app initialized successfully');
    }
};

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    RealTimeManager.cleanup();
}); 