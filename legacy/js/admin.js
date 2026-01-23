// Admin functionality for Order It All!

// Admin state management
const AdminState = {
    currentPage: 'trips',
    trips: [],
    selectedTrip: null,
    shoppingItems: [],
    subscriptions: []
};

// Page management for admin
const AdminPageManager = {
    // Show a specific page
    show: (pageName) => {
        // Hide all pages
        document.querySelectorAll('[id$="-page"]').forEach(page => {
            page.classList.add('hidden');
        });
        
        // Show requested page
        const pageElement = document.getElementById(`${pageName}-page`);
        if (pageElement) {
            pageElement.classList.remove('hidden');
            AdminState.currentPage = pageName;
            
            // Load page-specific data
            if (pageName === 'trips') {
                AdminTripManager.loadTrips();
            } else if (pageName === 'shopping') {
                AdminShoppingManager.loadOpenTrips();
            } else if (pageName === 'history') {
                AdminHistoryManager.loadClosedTrips();
            }
        }
    },
    
    // Initialize page navigation
    init: () => {
        // Navigation links
        document.querySelectorAll('[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = e.target.getAttribute('data-page');
                AdminPageManager.show(page);
            });
        });
    }
};

// Trip management for admin
const AdminTripManager = {
    // Load all trips (open and closed)
    loadTrips: async () => {
        try {
            Utils.DOM.show('#loading-screen');
            const trips = await API.trips.getAll();
            AdminState.trips = trips;
            AdminTripManager.renderTrips();
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
        if (!tripsList) return;
        
        tripsList.innerHTML = AdminState.trips.map(trip => `
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <div class="flex justify-between items-start">
                        <div>
                            <h2 class="card-title">${Utils.StringUtils.sanitize(trip.name)}</h2>
                            <p class="text-base-content/70">${Utils.StringUtils.sanitize(trip.description || 'No description')}</p>
                            <p class="text-sm text-base-content/50">Created ${Utils.DateTime.getRelativeTime(trip.created)}</p>
                        </div>
                        <div class="badge ${trip.status === 'open' ? 'status-open' : 'status-closed'}">
                            ${Utils.StringUtils.capitalize(trip.status)}
                        </div>
                    </div>
                    <div class="card-actions justify-end mt-4">
                        <button class="btn btn-ghost btn-sm" onclick="AdminTripManager.editTrip('${trip.id}')">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                            </svg>
                        </button>
                        ${trip.status === 'open' ? `
                            <button class="btn btn-warning btn-sm" onclick="AdminTripManager.closeTrip('${trip.id}')">
                                Close Trip
                            </button>
                        ` : ''}
                        <button class="btn btn-error btn-sm" onclick="AdminTripManager.deleteTrip('${trip.id}')">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    },
    
    // Create new trip
    createTrip: async (tripData) => {
        try {
            const errors = API.utils.validateTrip(tripData);
            if (errors.length > 0) {
                Utils.Toast.error(errors[0]);
                return;
            }
            
            await API.trips.create(tripData);
            Utils.Toast.success('Trip created successfully!');
            AdminTripManager.loadTrips();
            
            // Close modal
            const modal = document.getElementById('create-trip-modal');
            if (modal) modal.close();
            
        } catch (error) {
            Utils.Toast.error('Failed to create trip');
            console.error('Error creating trip:', error);
        }
    },
    
    // Edit trip
    editTrip: async (tripId) => {
        try {
            const trip = await API.trips.getById(tripId);
            
            // Populate edit modal
            document.getElementById('edit-trip-id').value = trip.id;
            document.getElementById('edit-trip-name').value = trip.name;
            document.getElementById('edit-trip-description').value = trip.description || '';
            document.getElementById('edit-trip-status').value = trip.status;
            
            // Show modal
            const modal = document.getElementById('edit-trip-modal');
            if (modal) modal.showModal();
            
        } catch (error) {
            Utils.Toast.error('Failed to load trip details');
            console.error('Error loading trip:', error);
        }
    },
    
    // Update trip
    updateTrip: async (tripId, tripData) => {
        try {
            await API.trips.update(tripId, tripData);
            Utils.Toast.success('Trip updated successfully!');
            AdminTripManager.loadTrips();
            
            // Close modal
            const modal = document.getElementById('edit-trip-modal');
            if (modal) modal.close();
            
        } catch (error) {
            Utils.Toast.error('Failed to update trip');
            console.error('Error updating trip:', error);
        }
    },
    
    // Close trip
    closeTrip: async (tripId) => {
        if (confirm('Are you sure you want to close this trip? This action cannot be undone.')) {
            try {
                await API.trips.close(tripId);
                Utils.Toast.success('Trip closed successfully!');
                AdminTripManager.loadTrips();
            } catch (error) {
                Utils.Toast.error('Failed to close trip');
                console.error('Error closing trip:', error);
            }
        }
    },
    
    // Delete trip
    deleteTrip: async (tripId) => {
        if (confirm('Are you sure you want to delete this trip? This action cannot be undone.')) {
            try {
                await API.trips.delete(tripId);
                Utils.Toast.success('Trip deleted successfully!');
                AdminTripManager.loadTrips();
            } catch (error) {
                Utils.Toast.error('Failed to delete trip');
                console.error('Error deleting trip:', error);
            }
        }
    },
    
    // Initialize event listeners
    initEvents: () => {
        // Create trip button
        document.getElementById('create-trip-btn')?.addEventListener('click', () => {
            const modal = document.getElementById('create-trip-modal');
            if (modal) modal.showModal();
        });
        
        // Create trip form
        document.getElementById('create-trip-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const tripData = {
                name: formData.get('trip-name'),
                description: formData.get('trip-description')
            };
            AdminTripManager.createTrip(tripData);
        });
        
        // Edit trip form
        document.getElementById('edit-trip-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const tripId = document.getElementById('edit-trip-id').value;
            const tripData = {
                name: formData.get('edit-trip-name'),
                description: formData.get('edit-trip-description'),
                status: formData.get('edit-trip-status')
            };
            AdminTripManager.updateTrip(tripId, tripData);
        });
        
        // Cancel buttons
        document.getElementById('cancel-create-trip')?.addEventListener('click', () => {
            const modal = document.getElementById('create-trip-modal');
            if (modal) modal.close();
        });
        
        document.getElementById('cancel-edit-trip')?.addEventListener('click', () => {
            const modal = document.getElementById('edit-trip-modal');
            if (modal) modal.close();
        });
    }
};

// Shopping mode management
const AdminShoppingManager = {
    // Load open trips for shopping
    loadOpenTrips: async () => {
        try {
            const trips = await API.trips.getOpen();
            const selector = document.getElementById('trip-selector');
            if (selector) {
                selector.innerHTML = '<option value="">Select a trip...</option>' +
                    trips.map(trip => `<option value="${trip.id}">${Utils.StringUtils.sanitize(trip.name)}</option>`).join('');
            }
        } catch (error) {
            Utils.Toast.error('Failed to load trips');
            console.error('Error loading trips:', error);
        }
    },
    
    // Load shopping list for selected trip
    loadShoppingList: async (tripId) => {
        try {
            const orders = await API.orders.getByTrip(tripId);
            const allItems = [];
            
            // Load items for each order
            for (const order of orders) {
                const items = await API.items.getByOrder(order.id);
                items.forEach(item => {
                    allItems.push({
                        ...item,
                        user_name: order.user_name
                    });
                });
            }
            
            AdminState.shoppingItems = allItems;
            AdminShoppingManager.renderShoppingList();
            
        } catch (error) {
            Utils.Toast.error('Failed to load shopping list');
            console.error('Error loading shopping list:', error);
        }
    },
    
    // Render shopping list
    renderShoppingList: () => {
        const shoppingList = document.getElementById('shopping-list');
        if (!shoppingList) return;
        
        if (AdminState.shoppingItems.length === 0) {
            shoppingList.innerHTML = `
                <div class="text-center py-8">
                    <div class="text-4xl mb-4">🛒</div>
                    <h3 class="text-xl font-semibold mb-2">No Items to Shop</h3>
                    <p class="text-base-content/70">Select a trip to see the shopping list</p>
                </div>
            `;
            return;
        }
        
        // Group items by user
        const groupedItems = Utils.ArrayUtils.groupBy(AdminState.shoppingItems, 'user_name');
        
        shoppingList.innerHTML = Object.entries(groupedItems).map(([userName, items]) => `
            <div class="card bg-base-100 shadow-lg">
                <div class="card-body">
                    <h3 class="card-title">
                        <div class="user-avatar mr-3">
                            ${Utils.StringUtils.getInitials(userName)}
                        </div>
                        ${Utils.StringUtils.sanitize(userName)}
                    </h3>
                    <div class="space-y-2">
                        ${items.map(item => `
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
                                    <button class="btn btn-ghost btn-sm" onclick="AdminShoppingManager.updateItemStatus('${item.id}')">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `).join('');
    },
    
    // Update item status
    updateItemStatus: async (itemId) => {
        try {
            const item = await API.items.getById(itemId);
            
            // Populate status modal
            document.getElementById('item-id').value = item.id;
            document.getElementById('item-name-display').value = item.name;
            document.getElementById('item-status').value = item.found_status;
            document.getElementById('item-price').value = item.price || '';
            
            // Show modal
            const modal = document.getElementById('item-status-modal');
            if (modal) modal.showModal();
            
        } catch (error) {
            Utils.Toast.error('Failed to load item details');
            console.error('Error loading item:', error);
        }
    },
    
    // Save item status
    saveItemStatus: async (itemId, status, price) => {
        try {
            const updateData = { found_status: status };
            if (price !== undefined && price !== '') {
                updateData.price = parseFloat(price);
            }
            
            await API.items.update(itemId, updateData);
            Utils.Toast.success('Item status updated successfully!');
            
            // Reload shopping list
            const tripSelector = document.getElementById('trip-selector');
            if (tripSelector && tripSelector.value) {
                AdminShoppingManager.loadShoppingList(tripSelector.value);
            }
            
            // Close modal
            const modal = document.getElementById('item-status-modal');
            if (modal) modal.close();
            
        } catch (error) {
            Utils.Toast.error('Failed to update item status');
            console.error('Error updating item status:', error);
        }
    },
    
    // Initialize event listeners
    initEvents: () => {
        // Trip selector
        document.getElementById('trip-selector')?.addEventListener('change', (e) => {
            const tripId = e.target.value;
            if (tripId) {
                AdminState.selectedTrip = tripId;
                AdminShoppingManager.loadShoppingList(tripId);
            } else {
                AdminState.selectedTrip = null;
                AdminState.shoppingItems = [];
                AdminShoppingManager.renderShoppingList();
            }
        });
        
        // Refresh button
        document.getElementById('refresh-shopping')?.addEventListener('click', () => {
            const tripSelector = document.getElementById('trip-selector');
            if (tripSelector && tripSelector.value) {
                AdminShoppingManager.loadShoppingList(tripSelector.value);
            }
        });
        
        // Item status form
        document.getElementById('item-status-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const itemId = document.getElementById('item-id').value;
            const status = formData.get('item-status');
            const price = formData.get('item-price');
            AdminShoppingManager.saveItemStatus(itemId, status, price);
        });
        
        // Cancel item status button
        document.getElementById('cancel-item-status')?.addEventListener('click', () => {
            const modal = document.getElementById('item-status-modal');
            if (modal) modal.close();
        });
    }
};

// History management
const AdminHistoryManager = {
    // Load closed trips
    loadClosedTrips: async () => {
        try {
            Utils.DOM.show('#loading-screen');
            const trips = await API.trips.getClosed();
            AdminHistoryManager.renderHistory(trips);
        } catch (error) {
            Utils.Toast.error('Failed to load trip history');
            console.error('Error loading history:', error);
        } finally {
            Utils.DOM.hide('#loading-screen');
        }
    },
    
    // Render history
    renderHistory: (trips) => {
        const historyList = document.getElementById('history-list');
        if (!historyList) return;
        
        if (trips.length === 0) {
            historyList.innerHTML = `
                <div class="text-center py-8">
                    <div class="text-4xl mb-4">📚</div>
                    <h3 class="text-xl font-semibold mb-2">No Trip History</h3>
                    <p class="text-base-content/70">No closed trips found</p>
                </div>
            `;
            return;
        }
        
        historyList.innerHTML = trips.map(trip => `
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <div class="flex justify-between items-start">
                        <div>
                            <h2 class="card-title">${Utils.StringUtils.sanitize(trip.name)}</h2>
                            <p class="text-base-content/70">${Utils.StringUtils.sanitize(trip.description || 'No description')}</p>
                            <p class="text-sm text-base-content/50">
                                Created ${Utils.DateTime.getRelativeTime(trip.created)} • 
                                Closed ${Utils.DateTime.getRelativeTime(trip.updated)}
                            </p>
                        </div>
                        <div class="badge status-closed">Closed</div>
                    </div>
                    <div class="card-actions justify-end mt-4">
                        <button class="btn btn-ghost btn-sm" onclick="AdminHistoryManager.viewTripDetails('${trip.id}')">
                            View Details
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    },
    
    // View trip details (placeholder)
    viewTripDetails: (tripId) => {
        Utils.Toast.info('Trip details view coming soon!');
    }
};

// Real-time updates for admin
const AdminRealTimeManager = {
    // Initialize real-time subscriptions
    init: () => {
        // Subscribe to trips changes
        API.subscriptions.subscribeToTrips((e) => {
            if (AdminState.currentPage === 'trips') {
                AdminTripManager.loadTrips();
            } else if (AdminState.currentPage === 'shopping') {
                AdminShoppingManager.loadOpenTrips();
            } else if (AdminState.currentPage === 'history') {
                AdminHistoryManager.loadClosedTrips();
            }
        });
        
        // Subscribe to orders and items changes for shopping mode
        if (AdminState.selectedTrip) {
            API.subscriptions.subscribeToOrders(AdminState.selectedTrip, (e) => {
                if (AdminState.currentPage === 'shopping') {
                    AdminShoppingManager.loadShoppingList(AdminState.selectedTrip);
                }
            });
        }
    },
    
    // Cleanup subscriptions
    cleanup: () => {
        API.subscriptions.unsubscribe();
    }
};

// Admin app initialization
const AdminApp = {
    // Initialize the admin application
    init: () => {
        // Hide loading screen and show app
        Utils.DOM.hide('#loading-screen');
        Utils.DOM.show('#app');
        
        // Initialize all managers
        AdminPageManager.init();
        AdminTripManager.initEvents();
        AdminShoppingManager.initEvents();
        
        // Show default page
        AdminPageManager.show('trips');
        
        // Initialize real-time updates
        AdminRealTimeManager.init();
        
        console.log('Order It All! admin panel initialized successfully');
    }
};

// Initialize admin app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    AdminApp.init();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    AdminRealTimeManager.cleanup();
}); 