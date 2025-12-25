# Hotel Management System

A modern, responsive hotel management system frontend built with React.js, featuring room management, reservations, calendar view, and guest tracking.

## 🚀 Features

- **Dashboard**: Overview of key metrics (rooms, check-ins, check-outs, revenue)
- **Rooms Management**: View and filter rooms by status, type, and search by room number
- **Reservations**: Manage reservations with filtering and sorting capabilities
- **Calendar View**: Visual calendar to view and create reservations
- **Guests**: Guest database with search functionality
- **Settings**: Hotel information and configuration

## 🛠️ Tech Stack

- **React 18** - UI library
- **React Router** - Navigation
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **date-fns** - Date manipulation

## 📦 Installation

1. **Clone or navigate to the project directory:**
   ```bash
   cd Hotel
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

## 🏃 Running the Application

### Development Mode

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173` (or the port shown in the terminal).

### Build for Production

Create an optimized production build:

```bash
npm run build
```

### Preview Production Build

Preview the production build locally:

```bash
npm run preview
```

## 📁 Project Structure

```
Hotel/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── StatusBadge.jsx
│   │   ├── StatCard.jsx
│   │   ├── Modal.jsx
│   │   ├── SearchInput.jsx
│   │   └── FilterSelect.jsx
│   ├── data/                # Static JSON data files
│   │   ├── hotel.json
│   │   ├── rooms.json
│   │   ├── reservations.json
│   │   └── guests.json
│   ├── layouts/             # Layout components
│   │   └── MainLayout.jsx
│   ├── pages/               # Page components
│   │   ├── LoginPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── RoomsPage.jsx
│   │   ├── ReservationsPage.jsx
│   │   ├── CalendarPage.jsx
│   │   ├── GuestsPage.jsx
│   │   └── SettingsPage.jsx
│   ├── App.jsx              # Main app component with routing
│   ├── main.jsx             # Entry point
│   └── index.css            # Global styles
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
└── README.md
```

## 🔐 Authentication

The login page is mocked for demonstration purposes. Any email and password combination will work to log in. The authentication state is stored in localStorage.

## 📊 Data Management

All data is stored in static JSON files located in `src/data/`:
- `hotel.json` - Hotel information
- `rooms.json` - Room data (30 rooms)
- `reservations.json` - Reservation records
- `guests.json` - Guest database

**Note**: New reservations created in the Calendar page are stored in React state only and will not persist after page refresh. This is by design for a frontend-only demo.

## 🎨 UI/UX Features

- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Status Badges**: Color-coded status indicators for rooms and reservations
- **Search & Filters**: Quick search and filtering on all list pages
- **Calendar View**: Interactive calendar with reservation visualization
- **Modal Dialogs**: Clean modal interfaces for creating reservations and viewing details
- **Modern Design**: Clean, professional UI with Tailwind CSS

## 📱 Pages Overview

### Login Page
- Simple email/password form
- Mock authentication (any credentials work)

### Dashboard
- Key performance indicators
- Real-time statistics from JSON data
- Card-based layout

### Rooms
- Table view of all rooms
- Filter by status and type
- Search by room number
- Room details (price, floor, features)

### Reservations
- List of all reservations
- Filter by status
- Sort by check-in, check-out, or guest name
- Search functionality

### Calendar
- Month view calendar
- Visual representation of reservations
- Click on dates to create new reservations
- Click on reservations to view details
- Overlap detection for room availability

### Guests
- Guest database
- Search by name
- View guest information and past stays

### Settings
- Hotel information display
- Check-in/check-out times
- Contact information

## 🎯 Usage Tips

1. **Creating Reservations**: 
   - Go to the Calendar page
   - Click on any date or use the "New Reservation" button
   - Fill in the form and submit
   - The reservation will appear immediately on the calendar

2. **Viewing Reservation Details**:
   - On the Calendar page, click on any reservation block
   - A modal will show full reservation details

3. **Filtering**:
   - Use the filter dropdowns on Rooms and Reservations pages
   - Combine with search for precise results

## 🔧 Customization

### Adding More Rooms
Edit `src/data/rooms.json` and add new room objects following the existing structure.

### Modifying Hotel Info
Edit `src/data/hotel.json` to update hotel details shown in Settings.

### Styling
The project uses Tailwind CSS. Modify `tailwind.config.js` to customize colors, spacing, and other design tokens.

## 📝 Notes

- This is a **frontend-only** application with no backend or database
- Data changes (like new reservations) are stored in React state and will reset on page refresh
- The calendar uses a custom implementation for simplicity
- All dates are handled using `date-fns` library

## 🐛 Troubleshooting

**Port already in use:**
- Vite will automatically try the next available port
- Check the terminal output for the actual port number

**Dependencies not installing:**
- Make sure you have Node.js 16+ installed
- Try deleting `node_modules` and `package-lock.json`, then run `npm install` again

**Styles not loading:**
- Ensure Tailwind CSS is properly configured
- Check that `index.css` is imported in `main.jsx`

## 📄 License

This project is for demonstration purposes.

---

**Built with ❤️ using React and Tailwind CSS**

