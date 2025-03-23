# Q.1(A): What is the fundamental difference between Pure ALOHA and Slotted ALOHA in terms of their timing mechanisms?

## Answer

The fundamental difference between Pure ALOHA and Slotted ALOHA lies in their timing mechanisms:

### Pure ALOHA
- In Pure ALOHA, stations can transmit data at any time without any time synchronization
- There is no time division or slots
- Stations transmit immediately when they have data to send
- This leads to higher probability of collisions
- Maximum throughput is only 18.4% of the channel capacity
- Vulnerable period is 2T (where T is the transmission time)

### Slotted ALOHA
- In Slotted ALOHA, time is divided into fixed-size slots
- Stations can only transmit at the beginning of a time slot
- Requires synchronization between all stations
- Reduces probability of collisions compared to Pure ALOHA
- Maximum throughput is 36.8% of the channel capacity (twice that of Pure ALOHA)
- Vulnerable period is only T (where T is the transmission time)

### Key Differences
1. **Timing Control**: Pure ALOHA has no timing control, while Slotted ALOHA requires synchronized time slots
2. **Transmission Flexibility**: Pure ALOHA allows transmission at any time, while Slotted ALOHA restricts transmission to slot boundaries
3. **Efficiency**: Slotted ALOHA is more efficient due to reduced collision probability
4. **Implementation Complexity**: Slotted ALOHA is more complex to implement due to synchronization requirements 