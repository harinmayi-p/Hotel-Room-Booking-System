CREATE DATABASE hotel_booking;
USE hotel_booking;

CREATE TABLE User (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone_no VARCHAR(15) NOT NULL,
    password VARCHAR(255) NOT NULL,
    address TEXT
);

CREATE TABLE Admin (
    user_id INT PRIMARY KEY,
    admin_level INT NOT NULL,
    permissions TEXT,
    last_login TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE
);


CREATE TABLE Staff (
    user_id INT PRIMARY KEY,
    role VARCHAR(50) NOT NULL,
    salary DECIMAL(10,2),
    work_shift VARCHAR(50),
    work_status ENUM('active','inactive') DEFAULT 'active',
    FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE
);


CREATE TABLE Customer (
    user_id INT PRIMARY KEY,
    loyalty_points INT DEFAULT 0,
    preferred_room_type VARCHAR(50),
    idproof_type VARCHAR(50) NOT NULL,
    idproof_no VARCHAR(50) UNIQUE NOT NULL,
    FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE
);

CREATE TABLE Room (
    room_no INT PRIMARY KEY,
    room_type VARCHAR(50) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    room_status ENUM('available','booked','maintenance') DEFAULT 'available',
    admin_id INT,
    staff_id INT,
    FOREIGN KEY (admin_id) REFERENCES Admin(user_id),
    FOREIGN KEY (staff_id) REFERENCES Staff(user_id)
);

CREATE TABLE Booking (
    booking_id INT PRIMARY KEY AUTO_INCREMENT,
    booking_date DATE NOT NULL,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    booking_status ENUM('confirmed','cancelled','pending') DEFAULT 'pending',
    room_no INT,
    customer_id INT,
    FOREIGN KEY (room_no) REFERENCES Room(room_no),
    FOREIGN KEY (customer_id) REFERENCES Customer(user_id)
);

CREATE TABLE Payment (
    payment_id INT PRIMARY KEY AUTO_INCREMENT,
    booking_id INT UNIQUE,
    amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(50),
    payment_status ENUM('paid','pending','failed') DEFAULT 'pending',
    FOREIGN KEY (booking_id) REFERENCES Booking(booking_id)
);

INSERT INTO User (name, email, phone_no, password)
VALUES 
('Admin1', 'admin@gmail.com', '9999999999', 'pass'),
('Staff1', 'staff@gmail.com', '8888888888', 'pass'),
('Customer1', 'cust@gmail.com', '7777777777', 'pass');




INSERT INTO Admin (user_id, admin_level)
VALUES (1, 1);

INSERT INTO Staff (user_id, role)
VALUES (2, 'Manager');

INSERT INTO Customer (user_id, idproof_type, idproof_no)
VALUES (3, 'Aadhar', '123456789012');

INSERT INTO Room (room_no, room_type, price, admin_id, staff_id)
VALUES 
(101, 'Deluxe', 2500, 1, 2),
(102, 'Standard', 1500, 1, 2);


CREATE INDEX idx_room_status ON Room(room_status);

CREATE INDEX idx_booking_room_dates 
ON Booking(room_no, check_in, check_out);

SELECT * FROM Room
WHERE room_status = 'available';

SELECT * FROM Booking
WHERE room_no = 101
AND check_in < '2026-04-07'
AND check_out > '2026-04-05';

INSERT INTO Booking (booking_date, check_in, check_out, room_no, customer_id)
VALUES (CURDATE(), '2026-04-05', '2026-04-07', 101, 3);


INSERT INTO Payment (booking_id, amount, payment_method)
VALUES (1, 5000, 'UPI');