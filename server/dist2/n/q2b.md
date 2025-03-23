# Q.2(B): Explain IP addressing? How it is classified?

## Answer

IP addressing is a fundamental concept in computer networking that provides unique identification to devices in a network. Let's explore its details and classification:

### IP Addressing Basics

1. **Definition**
   - Unique identifier for devices in a network
   - 32-bit (IPv4) or 128-bit (IPv6) address
   - Enables routing of data packets

2. **Components**
   - Network portion (identifies network)
   - Host portion (identifies device)
   - Subnet mask (separates network and host portions)

### IP Address Classification

1. **Class A**
   - Range: 1.0.0.0 to 126.255.255.255
   - First octet: Network ID
   - Remaining three octets: Host ID
   - Supports 16,777,216 hosts per network
   - Used for large networks

2. **Class B**
   - Range: 128.0.0.0 to 191.255.255.255
   - First two octets: Network ID
   - Remaining two octets: Host ID
   - Supports 65,536 hosts per network
   - Used for medium-sized networks

3. **Class C**
   - Range: 192.0.0.0 to 223.255.255.255
   - First three octets: Network ID
   - Last octet: Host ID
   - Supports 256 hosts per network
   - Used for small networks

4. **Class D**
   - Range: 224.0.0.0 to 239.255.255.255
   - Reserved for multicast
   - Not used for regular host addressing

5. **Class E**
   - Range: 240.0.0.0 to 255.255.255.255
   - Reserved for experimental use
   - Not used in public networks

### Special IP Addresses

1. **Private IP Addresses**
   - Class A: 10.0.0.0 to 10.255.255.255
   - Class B: 172.16.0.0 to 172.31.255.255
   - Class C: 192.168.0.0 to 192.168.255.255

2. **Reserved Addresses**
   - Loopback: 127.0.0.0 to 127.255.255.255
   - Broadcast: 255.255.255.255
   - Network address: Host portion all zeros
   - Broadcast address: Host portion all ones

### Modern Addressing Schemes

1. **CIDR (Classless Inter-Domain Routing)**
   - Replaces traditional class-based addressing
   - More flexible allocation of IP addresses
   - Uses slash notation (e.g., /24)

2. **VLSM (Variable Length Subnet Masking)**
   - Allows different subnet masks
   - More efficient use of address space
   - Better network design flexibility

### IPv6 Addressing

1. **Characteristics**
   - 128-bit address length
   - Hexadecimal representation
   - Eight groups of four hexadecimal digits
   - Example: 2001:0db8:85a3:0000:0000:8a2e:0370:7334

2. **Advantages**
   - Larger address space
   - Better security features
   - Improved routing efficiency
   - Auto-configuration capabilities 