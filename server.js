require('dotenv').config();
const express = require('express');
const path    = require('path');
const db      = require('./db');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ──────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve front-end files from /public
app.use(express.static(path.join(__dirname, 'public')));

// ── Health check ────────────────────────────────
app.get('/api', (req, res) => {
  res.json({ message: 'LuxeStay API is running 🚀' });
});

// ══════════════════════════════════════════════
//  USER ROUTES
// ══════════════════════════════════════════════

// Register new customer
app.post('/api/register', (req, res) => {
  const { name, email, phone_no, password, address } = req.body;

  if (!name || !email || !phone_no || !password) {
    return res.status(400).json({ success: false, message: 'All required fields must be filled.' });
  }

  const query = `
    INSERT INTO User (name, email, phone_no, password, address)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(query, [name, email, phone_no, password, address || null], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, message: 'Email already registered.' });
      }
      console.error('Register error:', err);
      return res.status(500).json({ success: false, message: 'Registration failed.' });
    }

    const userId = result.insertId;

    // Also insert into Customer table
    db.query(
      `INSERT INTO Customer (user_id, idproof_type, idproof_no) VALUES (?, 'Not Provided', ?)`,
      [userId, 'CUST-' + userId],
      (err2) => {
        if (err2) {
          console.error('Customer insert error:', err2);
        }
        res.status(201).json({ success: true, message: 'User registered successfully.', userId });
      }
    );
  });
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required.' });
  }

  db.query('SELECT * FROM User WHERE email = ?', [email], (err, users) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).json({ success: false, message: 'Login failed.' });
    }
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    const user = users[0];
    if (user.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid password.' });
    }

    // Determine role
    const userId = user.user_id;
    const getRoleSql = `
      SELECT 'admin'    AS role FROM Admin    WHERE user_id = ?
      UNION
      SELECT 'staff'    AS role FROM Staff    WHERE user_id = ?
      UNION
      SELECT 'customer' AS role FROM Customer WHERE user_id = ?
      LIMIT 1
    `;
    db.query(getRoleSql, [userId, userId, userId], (err2, roles) => {
      const role = roles && roles.length > 0 ? roles[0].role : 'customer';
      res.json({ success: true, message: 'Login successful.', user: { id: userId, name: user.name, email: user.email, role } });
    });
  });
});

// ══════════════════════════════════════════════
//  ROOM ROUTES
// ══════════════════════════════════════════════

// Get all rooms
app.get('/api/rooms', (req, res) => {
  db.query('SELECT * FROM Room', (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Error fetching rooms.' });
    }
    res.json({ success: true, rooms: result });
  });
});

// Get available rooms
app.get('/api/rooms/available', (req, res) => {
  db.query("SELECT * FROM Room WHERE room_status = 'available'", (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Error fetching available rooms.' });
    }
    res.json({ success: true, rooms: result });
  });
});

// Add a new room (admin)
app.post('/api/rooms', (req, res) => {
  const { room_no, room_type, price, room_status, admin_id, staff_id } = req.body;

  if (!room_no || !room_type || !price) {
    return res.status(400).json({ success: false, message: 'room_no, room_type and price are required.' });
  }

  db.query(
    `INSERT INTO Room (room_no, room_type, price, room_status, admin_id, staff_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [room_no, room_type, price, room_status || 'available', admin_id || null, staff_id || null],
    (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ success: false, message: 'Room number already exists.' });
        }
        console.error(err);
        return res.status(500).json({ success: false, message: 'Error adding room.' });
      }
      res.status(201).json({ success: true, message: 'Room added successfully.' });
    }
  );
});

// Update room status (admin / staff)
app.put('/api/rooms/:room_no', (req, res) => {
  const { room_no } = req.params;
  const { room_status, price, room_type } = req.body;

  const fields = [];
  const values = [];

  if (room_status) { fields.push('room_status = ?'); values.push(room_status); }
  if (price)       { fields.push('price = ?');       values.push(price); }
  if (room_type)   { fields.push('room_type = ?');   values.push(room_type); }

  if (fields.length === 0) {
    return res.status(400).json({ success: false, message: 'Nothing to update.' });
  }

  values.push(room_no);

  db.query(`UPDATE Room SET ${fields.join(', ')} WHERE room_no = ?`, values, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Error updating room.' });
    }
    res.json({ success: true, message: 'Room updated.' });
  });
});

// Delete room (admin)
app.delete('/api/rooms/:room_no', (req, res) => {
  const { room_no } = req.params;
  db.query('DELETE FROM Room WHERE room_no = ?', [room_no], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Error deleting room.' });
    }
    res.json({ success: true, message: 'Room deleted.' });
  });
});

// ══════════════════════════════════════════════
//  BOOKING ROUTES
// ══════════════════════════════════════════════

// Book a room
app.post('/api/book-room', (req, res) => {
  const { room_no, customer_id, check_in, check_out } = req.body;

  if (!room_no || !customer_id || !check_in || !check_out) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  // Check if room exists and is available
  db.query('SELECT * FROM Room WHERE room_no = ?', [room_no], (err, rooms) => {
    if (err || rooms.length === 0) {
      return res.status(404).json({ success: false, message: 'Room not found.' });
    }
    if (rooms[0].room_status !== 'available') {
      return res.status(409).json({ success: false, message: 'Room is not available.' });
    }

    // Check date overlap
    const overlapSql = `
      SELECT * FROM Booking
      WHERE room_no = ? AND booking_status != 'cancelled'
        AND check_in < ? AND check_out > ?
    `;
    db.query(overlapSql, [room_no, check_out, check_in], (err2, conflicts) => {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ success: false, message: 'Error checking availability.' });
      }
      if (conflicts.length > 0) {
        return res.status(409).json({ success: false, message: 'Room already booked for those dates.' });
      }

      // Insert booking
      const bookSql = `
        INSERT INTO Booking (booking_date, check_in, check_out, booking_status, room_no, customer_id)
        VALUES (CURDATE(), ?, ?, 'confirmed', ?, ?)
      `;
      db.query(bookSql, [check_in, check_out, room_no, customer_id], (err3, result) => {
        if (err3) {
          console.error(err3);
          return res.status(500).json({ success: false, message: 'Error creating booking.' });
        }

        // Update room status
        db.query("UPDATE Room SET room_status = 'booked' WHERE room_no = ?", [room_no]);

        res.status(201).json({ success: true, message: 'Room booked successfully.', booking_id: result.insertId });
      });
    });
  });
});

// Get all bookings
app.get('/api/bookings', (req, res) => {
  const sql = `
    SELECT b.*, u.name AS customer_name, r.room_type, r.price
    FROM Booking b
    JOIN Customer c ON b.customer_id = c.user_id
    JOIN User u     ON c.user_id     = u.user_id
    JOIN Room r     ON b.room_no     = r.room_no
    ORDER BY b.booking_id DESC
  `;
  db.query(sql, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Error fetching bookings.' });
    }
    res.json({ success: true, bookings: result });
  });
});

// Get bookings for a specific customer
app.get('/api/bookings/customer/:customer_id', (req, res) => {
  const { customer_id } = req.params;
  const sql = `
    SELECT b.*, r.room_type, r.price, p.amount, p.payment_method, p.payment_status
    FROM Booking b
    JOIN Room r    ON b.room_no    = r.room_no
    LEFT JOIN Payment p ON p.booking_id = b.booking_id
    WHERE b.customer_id = ?
    ORDER BY b.booking_id DESC
  `;
  db.query(sql, [customer_id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Error fetching bookings.' });
    }
    res.json({ success: true, bookings: result });
  });
});

// Cancel a booking
app.delete('/api/cancel-booking/:id', (req, res) => {
  const booking_id = req.params.id;

  db.query('SELECT room_no FROM Booking WHERE booking_id = ?', [booking_id], (err, result) => {
    if (err || result.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    const room_no = result[0].room_no;

    // Delete payment first (FK constraint)
    db.query('DELETE FROM Payment WHERE booking_id = ?', [booking_id], () => {
      db.query('DELETE FROM Booking WHERE booking_id = ?', [booking_id], (err2) => {
        if (err2) {
          console.error(err2);
          return res.status(500).json({ success: false, message: 'Error cancelling booking.' });
        }
        db.query("UPDATE Room SET room_status = 'available' WHERE room_no = ?", [room_no]);
        res.json({ success: true, message: 'Booking cancelled successfully.' });
      });
    });
  });
});

// ══════════════════════════════════════════════
//  PAYMENT ROUTES
// ══════════════════════════════════════════════

app.post('/api/payment', (req, res) => {
  const { booking_id, amount, payment_method } = req.body;

  if (!booking_id || !amount || !payment_method) {
    return res.status(400).json({ success: false, message: 'booking_id, amount and payment_method are required.' });
  }

  const query = `
    INSERT INTO Payment (booking_id, amount, payment_method, payment_status)
    VALUES (?, ?, ?, 'paid')
    ON DUPLICATE KEY UPDATE payment_method = VALUES(payment_method), payment_status = 'paid', amount = VALUES(amount)
  `;

  db.query(query, [booking_id, amount, payment_method], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Payment failed.' });
    }
    res.json({ success: true, message: 'Payment recorded successfully.' });
  });
});

// ══════════════════════════════════════════════
//  CUSTOMER ROUTES
// ══════════════════════════════════════════════

app.get('/api/customers', (req, res) => {
  const sql = `
    SELECT u.user_id, u.name, u.email, u.phone_no, u.address,
           c.loyalty_points, c.preferred_room_type
    FROM User u
    JOIN Customer c ON u.user_id = c.user_id
    ORDER BY u.user_id DESC
  `;
  db.query(sql, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Error fetching customers.' });
    }
    res.json({ success: true, customers: result });
  });
});

// ══════════════════════════════════════════════
//  FALLBACK — serve index.html for any unknown route
// ══════════════════════════════════════════════
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ LuxeStay server running at http://localhost:${PORT}`);
});
