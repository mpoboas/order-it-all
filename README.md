# Order It All! - Grocery Orders Web App

A mobile-first web application for managing grocery orders during vacations with friends. Built with HTML, Tailwind CSS, DaisyUI, and Vanilla JavaScript, powered by PocketBase.

## Features

### For Regular Users
- **User Management**: Simple name-based authentication stored in localStorage
- **Trip Browsing**: View all open grocery trips
- **Order Creation**: Add multiple items with quantities, brands, and notes
- **Edit Timer**: 5-minute window to edit orders after creation
- **Real-time Updates**: See changes instantly via PocketBase subscriptions
- **Order Status**: Track item status (pending, found, not available) and prices

### For Admins (via /admin.html)
- **Trip Management**: Create, edit, and delete trips
- **Shopping Mode**: Mark items as found/not available while shopping
- **Price Setting**: Set prices for items after shopping
- **Trip Closure**: Close trips to archive them
- **Full Control**: Override all user restrictions

## Tech Stack

- **Frontend**: HTML5, Tailwind CSS, DaisyUI, Vanilla JavaScript
- **Backend**: PocketBase (deployed on homeserver)
- **Hosting**: Netlify (frontend only)
- **Database**: PocketBase with collections for trips, orders, and items

## Database Schema

### trips
- `id`: Unique identifier
- `name`: Trip name
- `description`: Optional description
- `status`: "open" or "closed"
- `created_by`: Creator identifier
- `created`: Creation timestamp
- `updated`: Last update timestamp

### orders
- `id`: Unique identifier
- `trip_id`: Reference to trips collection
- `user_name`: Name of the person placing the order
- `can_edit_until`: Timestamp until which order can be edited
- `created`: Creation timestamp
- `updated`: Last update timestamp

### items
- `id`: Unique identifier
- `order_id`: Reference to orders collection
- `name`: Item name
- `quantity`: Numeric quantity
- `brand`: Optional brand name
- `notes`: Optional notes
- `found_status`: "pending", "found", or "not_available"
- `price`: Numeric price (set by admin)
- `created`: Creation timestamp
- `updated`: Last update timestamp

## Project Structure

```
order-it-all/
├── index.html          # Main application
├── admin.html          # Admin interface
├── css/
│   └── style.css      # Custom styles
├── js/
│   ├── utils.js       # Utility functions
│   ├── api.js         # PocketBase API integration
│   ├── app.js         # Main application logic
│   └── admin.js       # Admin functionality
└── README.md          # This file
```

## Getting Started

1. **Deploy to Netlify**: Upload the project files to Netlify
2. **Configure PocketBase**: Ensure your PocketBase instance is running and accessible
3. **Update API URL**: Modify the PocketBase URL in `js/api.js` if needed
4. **Access the App**: Visit your Netlify URL to start using the app

## Usage

### Regular Users
1. Enter your name on the welcome screen
2. Browse open trips
3. Click on a trip to view orders
4. Add your order with items
5. Edit within 5 minutes if needed

### Admins
1. Navigate to `/admin.html`
2. Create and manage trips
3. Use shopping mode to mark items as found/not available
4. Set prices and close trips when complete

## Business Rules

- Only positive decimal quantities allowed
- Users identified by name only (no passwords)
- 5-minute edit window for user orders
- Admins can override all restrictions
- Closed trips become read-only history
- All collections have public API access

## Development

The app uses a modular JavaScript architecture with:
- **Utils**: Helper functions for localStorage, timers, validation
- **API**: PocketBase integration with CRUD operations
- **App**: Main user interface logic
- **Admin**: Administrative functionality

Real-time updates are handled through PocketBase subscriptions, ensuring all users see changes instantly.

## License

This project is open source and available under the MIT License.
