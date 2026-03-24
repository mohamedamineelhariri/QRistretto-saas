import jwt from 'jsonwebtoken';

/**
 * Setup Socket.IO event handlers with JWT authentication
 * Updated for multi-tenant architecture: uses locationId instead of restaurantId
 */
export function setupSocketHandlers(io) {
    // Authenticate all socket connections
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) {
                return next(new Error('Authentication required'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Attach user info to socket
            socket.data = {
                userId: decoded.userId,
                tenantId: decoded.tenantId,
                locationId: decoded.locationId,
                role: decoded.role,
            };

            next();
        } catch (error) {
            return next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`🔌 Socket connected: ${socket.id} (user: ${socket.data.userId || 'unknown'})`);

        // Join restaurant room (location-scoped)
        socket.on('join:restaurant', (locationId) => {
            // Security: Only allow joining the location from the token
            if (!locationId) {
                socket.emit('error', { message: 'Location ID required' });
                return;
            }

            if (socket.data.locationId !== locationId) {
                socket.emit('error', { message: 'Unauthorized: location mismatch' });
                return;
            }

            socket.join(`restaurant:${locationId}`);
            console.log(`   ✅ Joined location room: ${locationId} (user: ${socket.data.userId})`);
        });

        // Join order room (for customer order tracking)
        socket.on('join:order', (orderId) => {
            if (!orderId) return;
            socket.join(`order:${orderId}`);
            console.log(`   📦 Joined order room: ${orderId}`);
        });

        // Leave restaurant room
        socket.on('leave:restaurant', (locationId) => {
            socket.leave(`restaurant:${locationId}`);
        });

        // Leave order room
        socket.on('leave:order', (orderId) => {
            socket.leave(`order:${orderId}`);
        });

        socket.on('disconnect', () => {
            console.log(`🔌 Socket disconnected: ${socket.id}`);
        });
    });
}
