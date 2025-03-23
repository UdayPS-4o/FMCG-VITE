# Q.2(A): Define the concept of routing and its types

## Answer

Routing is the process of selecting paths in a network along which to send network traffic. Let's explore the concept and its various types:

### Concept of Routing

1. **Basic Definition**
   - Process of forwarding packets from source to destination
   - Involves path selection and packet forwarding
   - Essential for inter-network communication

2. **Key Components**
   - Routing tables
   - Routing algorithms
   - Routing protocols
   - Network topology information

### Types of Routing

1. **Static Routing**
   - Routes are manually configured
   - No automatic updates
   - Advantages:
     * Simple to implement
     * No overhead
     * Secure
   - Disadvantages:
     * Manual configuration required
     * No automatic recovery
     * Not suitable for large networks

2. **Dynamic Routing**
   - Routes are automatically updated
   - Uses routing protocols
   - Advantages:
     * Automatic updates
     * Network adaptation
     * Scalable
   - Disadvantages:
     * More complex
     * Protocol overhead
     * Security concerns

3. **Default Routing**
   - Used when no specific route exists
   - Acts as a fallback route
   - Common in small networks
   - Simplifies routing tables

4. **Distance Vector Routing**
   - Uses Bellman-Ford algorithm
   - Routers share distance information
   - Examples: RIP, IGRP
   - Characteristics:
     * Periodic updates
     * Hop count based
     * Simple to implement

5. **Link State Routing**
   - Uses Dijkstra's algorithm
   - Routers share topology information
   - Examples: OSPF, IS-IS
   - Characteristics:
     * Event-driven updates
     * Cost-based routing
     * More complex

### Routing Metrics

1. **Common Metrics**
   - Hop count
   - Bandwidth
   - Delay
   - Cost
   - Load
   - Reliability

2. **Metric Selection**
   - Based on network requirements
   - Can be combined
   - Affects routing decisions

### Routing Protocols

1. **Interior Gateway Protocols (IGP)**
   - Used within autonomous systems
   - Examples: RIP, OSPF, EIGRP

2. **Exterior Gateway Protocols (EGP)**
   - Used between autonomous systems
   - Example: BGP 