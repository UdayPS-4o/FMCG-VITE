# Q.3(A): Define TCP and UDP

## Answer

TCP (Transmission Control Protocol) and UDP (User Datagram Protocol) are two fundamental transport layer protocols in computer networking. Let's explore their characteristics and differences:

### TCP (Transmission Control Protocol)

1. **Characteristics**
   - Connection-oriented protocol
   - Reliable data delivery
   - Ordered data transmission
   - Flow control
   - Congestion control

2. **Key Features**
   - Three-way handshake
   - Acknowledgment mechanism
   - Retransmission of lost packets
   - Sequence numbers
   - Window-based flow control

3. **Applications**
   - Web browsing (HTTP/HTTPS)
   - Email (SMTP)
   - File transfer (FTP)
   - Remote login (SSH)
   - Database connections

4. **Advantages**
   - Guaranteed delivery
   - Ordered data
   - Error checking
   - Flow control
   - Congestion control

### UDP (User Datagram Protocol)

1. **Characteristics**
   - Connectionless protocol
   - Best-effort delivery
   - No guaranteed delivery
   - No ordering
   - No flow control

2. **Key Features**
   - Simple header
   - No connection establishment
   - No acknowledgment
   - No retransmission
   - No flow control

3. **Applications**
   - Video streaming
   - Online gaming
   - Voice over IP (VoIP)
   - DNS queries
   - Real-time applications

4. **Advantages**
   - Lower overhead
   - Faster transmission
   - No connection delay
   - Better for real-time applications
   - Multicast support

### Comparison

1. **Reliability**
   - TCP: Guaranteed delivery
   - UDP: Best-effort delivery

2. **Ordering**
   - TCP: Ordered data
   - UDP: No ordering

3. **Speed**
   - TCP: Slower due to overhead
   - UDP: Faster due to simplicity

4. **Overhead**
   - TCP: Higher overhead
   - UDP: Lower overhead

5. **Use Cases**
   - TCP: Reliable data transfer
   - UDP: Real-time applications

### Protocol Selection Factors

1. **When to Use TCP**
   - Need reliable delivery
   - Data order is important
   - Large data transfers
   - Need flow control

2. **When to Use UDP**
   - Real-time applications
   - Speed is critical
   - Small data packets
   - Tolerable packet loss

### Header Structure

1. **TCP Header**
   - 20-60 bytes
   - Contains sequence numbers
   - Contains acknowledgment numbers
   - Contains window size
   - Contains flags

2. **UDP Header**
   - 8 bytes
   - Contains source port
   - Contains destination port
   - Contains length
   - Contains checksum

### Error Handling

1. **TCP Error Handling**
   - Acknowledgment system
   - Retransmission
   - Checksum verification
   - Timeout mechanism

2. **UDP Error Handling**
   - Basic checksum
   - No retransmission
   - No acknowledgment
   - No timeout 